import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import { 
  getUserChats, 
  getOrCreatePrivateChat,
  ChatFilter 
} from "@/lib/chat-service";
import { withCache, getCacheKey } from "@/lib/cache";
import * as Sentry from "@sentry/nextjs";

// GET - получение списка чатов пользователя
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

    // Получаем параметры фильтрации
    const filter: ChatFilter = {};
    
    const typeParam = searchParams.get("type");
    if (typeParam === "PRIVATE" || typeParam === "GROUP") {
      filter.type = typeParam;
    }

    const hasTicketParam = searchParams.get("hasTicket");
    if (hasTicketParam === "true") {
      filter.hasTicket = true;
    } else if (hasTicketParam === "false") {
      filter.hasTicket = false;
    }

    // Кешируем список чатов на короткое время (15 сек)
    const cacheKey = getCacheKey(`user:chats:${userId}`, filter);
    
    const chats = await Sentry.startSpan(
      {
        op: "db.query",
        name: "GET /api/chat - fetch user chats",
      },
      async (span) => {
        span.setAttribute("userId", userId);
        return withCache(
          cacheKey,
          () => getUserChats(userId, filter),
          15 // 15 секунд кеш
        );
      }
    );

    // Форматируем для совместимости с существующим фронтендом
    const formattedChats = chats.map((chat) => ({
      id: chat.id,
      type: chat.type,
      name: chat.name,
      description: chat.description,
      iconUrl: chat.iconUrl,
      isPublic: chat.isPublic,
      otherUser: chat.otherUser,
      lastMessage: chat.lastMessage,
      lastMessageAt: chat.lastMessageAt,
      unreadCount: chat.unreadCount,
      createdAt: chat.createdAt,
      ticketId: chat.ticketId,
      ticketPublicId: chat.ticketPublicId,
      ticketTitle: chat.ticketTitle,
      participants: chat.participants,
      participantsCount: chat.participantsCount,
      _count: {
        participants: chat.participantsCount,
      },
    }));

    return NextResponse.json({ chats: formattedChats });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat] GET Error:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.substring(0, 500),
    });
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

// POST - создание нового чата или получение существующего
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { targetUserId } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ error: "ID пользователя не указан" }, { status: 400 });
    }

    if (userId === targetUserId) {
      return NextResponse.json({ error: "Нельзя создать чат с самим собой" }, { status: 400 });
    }

    // Проверяем существование целевого пользователя
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { 
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
        phone: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Используем новый сервис
    const { chat, isNew } = await getOrCreatePrivateChat(userId, targetUserId);

    // Нормализуем аватарку
    const normalizedUser = normalizeUserAvatar(targetUser);

    return NextResponse.json({
      chat: {
        id: chat.id,
        isNew,
        otherUser: {
          id: normalizedUser.id,
          firstName: normalizedUser.firstName,
          lastName: normalizedUser.lastName,
          middleName: normalizedUser.middleName,
          avatarUrl: normalizedUser.avatarUrl,
          phone: normalizedUser.phone,
        },
      },
    });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat] POST Error:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.substring(0, 500),
    });
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
