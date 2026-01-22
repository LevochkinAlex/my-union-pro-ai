import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/appeals
 * Получить список обращений для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    // Получаем чаты председателя, чтобы показывать обращения из этих чатов
    const chairmanChats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: session.user.id,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
      },
    });

    const chairmanChatIds = chairmanChats.map(chat => chat.id);

    // Формируем условия фильтрации:
    // 1. Обращения из организации председателя
    // 2. Обращения, связанные с чатами председателя (для старых обращений без organizationId)
    const orConditions: any[] = [];
    
    // Обращения из организации председателя
    if (chairman.organizationId) {
      orConditions.push({ organizationId: chairman.organizationId });
    }
    
    // Обращения из чатов председателя (для старых обращений)
    if (chairmanChatIds.length > 0) {
      orConditions.push({ chatId: { in: chairmanChatIds } });
    }
    
    // Если нет условий для OR, возвращаем пустой результат
    // (председатель без организации и без чатов не должен видеть обращения)
    // Важно: Prisma не поддерживает пустой массив в OR (генерирует "AND 1=0"),
    // поэтому проверяем длину перед использованием OR
    let where: any;
    if (orConditions.length > 0) {
      where = { OR: orConditions };
    } else {
      // Используем несуществующий ID для гарантированного пустого результата
      // Это безопаснее, чем пустой OR массив, который Prisma интерпретирует как "AND 1=0"
      where = { id: 'never-match' };
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            email: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
        comments: {
          select: {
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        publicId: ticket.publicId,
        type: ticket.type,
        status: ticket.status,
        priority: ticket.priority,
        title: ticket.title,
        content: ticket.content,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        user: {
          ...ticket.user,
          avatarUrl: ticket.user.avatarUrl,
        },
        commentsCount: ticket._count.comments,
        lastCommentAt: ticket.comments[0]?.createdAt.toISOString() || null,
        chatId: ticket.chatId,
        rejectionReason: ticket.rejectionReason,
      })),
    });
  } catch (error: any) {
    console.error("[ppo-head/appeals] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении обращений",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

