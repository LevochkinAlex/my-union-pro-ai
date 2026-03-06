import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType, DocumentCategory, DocumentStatus, Prisma } from "@prisma/client";
import { checkUserPermissions } from "@/lib/staff-permissions";

/**
 * GET /api/ppo-head/documents
 * Получить журнал документов организации с фильтрами
 * 
 * Query параметры:
 * - category: INCOMING | OUTGOING | INTERNAL | DRAFT
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

    const perm = await checkUserPermissions(session.user.id, "documents_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "documents_view",
          denyReason: perm.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }
    const organizationId = perm.organizationId;

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

    // ID документов повесток и протоколов заседаний организации (на случай если у документа нет organizationId)
    const meetingDocs = await prisma.meeting.findMany({
      where: { organizationId },
      select: { agendaDocumentId: true, protocolDocumentId: true },
    });
    const meetingDocumentIds = meetingDocs.flatMap((m) =>
      [m.agendaDocumentId, m.protocolDocumentId].filter((id): id is string => id != null)
    );

    // Строим условия фильтрации: по organizationId ИЛИ по привязке к заседанию организации
    const where: Prisma.DocumentWhereInput =
      meetingDocumentIds.length > 0
        ? { OR: [{ organizationId }, { id: { in: meetingDocumentIds } }] }
        : { organizationId };

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
      where.regDate = {};
      if (from) {
        where.regDate.gte = new Date(from);
      }
      if (to) {
        where.regDate.lte = new Date(to);
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
          { priority: "desc" },
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

    // Статистика по статусам (для текущей категории)
    const statusStats = await prisma.document.groupBy({
      by: ["status"],
      where: category ? { organizationId, category } : { organizationId },
      _count: { status: true },
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
      },
    });
  } catch (error: any) {
    console.error("[ppo-head/documents] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении документов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ppo-head/documents
 * Создать входящий документ (регистрация)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_create");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "documents_create",
          denyReason: perm.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }
    const organizationId = perm.organizationId;

    const body = await request.json();
    const {
      title,
      description,
      category,
      type,
      priority,
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
        category: category || "INTERNAL",
        type: type || "OTHER",
        status: "DRAFT",
        priority: priority || "NORMAL",
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
    console.error("[ppo-head/documents] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании документа",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
