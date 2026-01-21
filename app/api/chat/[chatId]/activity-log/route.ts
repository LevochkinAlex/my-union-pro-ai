import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireChatAccess, ChatAccessError } from "@/lib/chat-service";

/**
 * GET /api/chat/[chatId]/activity-log
 * Получить лог активности для чата обращения
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем доступ
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Находим чат и связанный тикет
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        ticket: {
          select: {
            id: true,
            publicId: true,
            title: true,
            status: true,
            actionLogs: {
              orderBy: { createdAt: "desc" },
              take: 50,
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    // Если это не чат обращения, возвращаем пустой лог
    if (!chat.ticket) {
      return NextResponse.json({ 
        isTicketChat: false,
        activities: [] 
      });
    }

    // Форматируем лог активности
    const activities = chat.ticket.actionLogs.map((log) => ({
      id: log.id,
      type: log.actionType,
      description: log.description,
      user: {
        id: log.user.id,
        firstName: log.user.firstName,
        lastName: log.user.lastName,
        avatarUrl: log.user.avatarUrl,
        name: [log.user.lastName, log.user.firstName].filter(Boolean).join(" ") || "Пользователь",
      },
      oldValue: log.oldValue,
      newValue: log.newValue,
      metadata: log.metadata,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({
      isTicketChat: true,
      ticket: {
        id: chat.ticket.id,
        publicId: chat.ticket.publicId,
        title: chat.ticket.title,
        status: chat.ticket.status,
      },
      activities,
    });
  } catch (error: any) {
    console.error("[chat/activity-log] Error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении лога активности",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/[chatId]/activity-log
 * Добавить запись в лог активности
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем доступ
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    const { actionType, description, oldValue, newValue, metadata } = await request.json();

    if (!actionType || !description) {
      return NextResponse.json(
        { error: "Тип действия и описание обязательны" },
        { status: 400 }
      );
    }

    // Находим связанный тикет
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        ticket: {
          select: { id: true },
        },
      },
    });

    if (!chat?.ticket) {
      return NextResponse.json(
        { error: "Чат не связан с обращением" },
        { status: 400 }
      );
    }

    // Создаём запись в логе
    const activity = await prisma.ticketActionLog.create({
      data: {
        ticketId: chat.ticket.id,
        userId,
        actionType,
        description,
        oldValue: oldValue || null,
        newValue: newValue || null,
        metadata: metadata || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Также создаём системное сообщение в чате для наглядности
    await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: userId,
        content: description,
        messageType: "activity",
      },
    });

    return NextResponse.json({
      activity: {
        id: activity.id,
        type: activity.actionType,
        description: activity.description,
        user: {
          id: activity.user.id,
          firstName: activity.user.firstName,
          lastName: activity.user.lastName,
          avatarUrl: activity.user.avatarUrl,
        },
        createdAt: activity.createdAt,
      },
    });
  } catch (error: any) {
    console.error("[chat/activity-log] POST Error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при добавлении записи в лог",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
