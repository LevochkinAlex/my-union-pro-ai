import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentCategory, DocumentStatus, DocumentType, Prisma } from "@prisma/client";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { checkUserPermissions } from "@/lib/staff-permissions";

/**
 * GET /api/ppo-head/documents/journal
 * Журнал документов организации с фильтрами
 * 
 * Query параметры:
 * - category: INCOMING | OUTGOING | INTERNAL | DRAFT (журнал)
 * - status: статус документа
 * - type: тип документа
 * - search: поиск по названию и номеру
 * - from: дата от
 * - to: дата до
 * - assignedToMe: только назначенные мне
 * - page: номер страницы
 * - limit: количество на странице
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем доступ (председатель или сотрудник с правами)
    const chairman = await getPPOHead(session.user.id);
    let organizationId: string | null = null;

    if (chairman) {
      organizationId = chairman.organizationId;
    } else {
      const permissions = await checkUserPermissions(session.user.id, "documents_view");
      if (!permissions.hasAccess) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      organizationId = permissions.organizationId;
    }

    if (!organizationId) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as DocumentCategory | null;
    const status = searchParams.get("status") as DocumentStatus | null;
    const type = searchParams.get("type") as DocumentType | null;
    const search = searchParams.get("search");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const assignedToMe = searchParams.get("assignedToMe") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    // Строим условия фильтрации
    const where: Prisma.DocumentWhereInput = {
      organizationId,
    };

    if (category) {
      where.category = category;
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { regNumber: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = new Date(from);
      }
      if (to) {
        where.createdAt.lte = new Date(to);
      }
    }

    if (assignedToMe) {
      where.assignedToId = session.user.id;
    }

    // Получаем документы с пагинацией
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
          assignedTo: {
            select: { id: true, firstName: true, lastName: true },
          },
          approvedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          signedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          template: {
            select: { id: true, name: true },
          },
          _count: {
            select: {
              approvals: true,
              responses: true,
            },
          },
        },
        orderBy: [
          { isUrgent: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    // Получаем статистику по категориям
    const stats = await prisma.document.groupBy({
      by: ["category"],
      where: { organizationId },
      _count: { category: true },
    });

    const categoryStats = {
      INCOMING: 0,
      OUTGOING: 0,
      INTERNAL: 0,
      DRAFT: 0,
    };

    stats.forEach((s) => {
      if (s.category) {
        categoryStats[s.category] = s._count.category;
      }
    });

    // Статистика по статусам
    const statusStats = await prisma.document.groupBy({
      by: ["status"],
      where: category ? { organizationId, category } : { organizationId },
      _count: { status: true },
    });

    // Количество ожидающих моих действий
    const pendingMyAction = await prisma.document.count({
      where: {
        organizationId,
        OR: [
          { assignedToId: session.user.id, status: { in: ["PENDING_REVIEW", "PENDING_APPROVAL"] } },
          {
            approvals: {
              some: {
                userId: session.user.id,
                status: "PENDING",
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        byCategory: categoryStats,
        byStatus: statusStats.reduce((acc, s) => {
          acc[s.status] = s._count.status;
          return acc;
        }, {} as Record<string, number>),
        pendingMyAction,
      },
    });
  } catch (error: any) {
    console.error("[ppo-head/documents/journal] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении журнала документов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ppo-head/documents/journal
 * Зарегистрировать входящий документ
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем доступ
    const chairman = await getPPOHead(session.user.id);
    let organizationId: string | null = null;

    if (chairman) {
      organizationId = chairman.organizationId;
    } else {
      const permissions = await checkUserPermissions(session.user.id, "documents_create");
      if (!permissions.hasAccess) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      organizationId = permissions.organizationId;
    }

    if (!organizationId) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      description,
      category,
      type,
      isUrgent,
      dueDate,
      senderName,
      senderOrganization,
      senderRegNumber,
      senderDate,
      recipientName,
      recipientOrganization,
      assignedToId,
    } = body;

    if (!title) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }

    // Создаём документ
    const document = await prisma.document.create({
      data: {
        title,
        description,
        category: category || "INCOMING",
        type: type || "OTHER",
        status: "DRAFT",
        priority: "NORMAL",
        isUrgent: isUrgent || false,
        dueDate: dueDate ? new Date(dueDate) : null,
        senderName,
        senderOrganization,
        senderRegNumber,
        senderDate: senderDate ? new Date(senderDate) : null,
        recipientName,
        recipientOrganization,
        assignedToId,
        assignedAt: assignedToId ? new Date() : null,
        userId: session.user.id,
        organizationId,
      },
    });

    // Создаём запись в истории
    await prisma.documentStatusHistory.create({
      data: {
        documentId: document.id,
        status: "DRAFT",
        changedById: session.user.id,
        comment: "Документ создан",
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error: any) {
    console.error("[ppo-head/documents/journal] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании документа",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
