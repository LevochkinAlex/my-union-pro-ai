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

/**
 * GET /api/chat
 * Получить список чатов пользователя
 */
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
        name: "GET /api/chat - getUserChats",
      },
      async (span) => {
        span.setAttribute("userId", userId);
        span.setAttribute("filter", JSON.stringify(filter));
        
        return await withCache(cacheKey, async () => {
          return await getUserChats(userId, filter);
        }, 15);
      }
    );

    return NextResponse.json({ chats });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat] GET Error:", error?.message);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat
 * Создать новый чат
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { targetUserId, participantIds, name } = body;

    let chat;
    let isNew = false;

    // Создаем личный чат
    if (targetUserId) {
      const result = await getOrCreatePrivateChat(userId, targetUserId);
      chat = result.chat;
      isNew = result.isNew;
    } 
    // Создаем групповой чат
    else if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
      // Проверяем, нет ли уже такого группового чата с теми же участниками
      const existingChat = await prisma.chat.findFirst({
        where: {
          type: 'GROUP',
          name: name || null,
          participants: {
            every: {
              userId: { in: [userId, ...participantIds] },
              leftAt: null,
            },
          },
        },
        include: {
          participants: {
            where: { leftAt: null },
          },
        },
      });

      if (existingChat && existingChat.participants.length === participantIds.length + 1) {
        chat = existingChat;
        isNew = false;
      } else {
        // Создаем новый групповой чат
        chat = await prisma.chat.create({
          data: {
            type: 'GROUP',
            name: name || 'Групповой чат',
            createdById: userId,
            participants: {
              create: [
                { userId, role: 'admin' },
                ...participantIds.map((id: string) => ({ userId: id, role: 'member' })),
              ],
            },
          },
          include: {
            participants: {
              where: { leftAt: null },
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
        });
        isNew = true;
      }
    } else {
      return NextResponse.json(
        { error: "Необходимо указать targetUserId или participantIds" },
        { status: 400 }
      );
    }

    if (!chat) {
      return NextResponse.json(
        { error: "Не удалось создать чат" },
        { status: 500 }
      );
    }

    // Получаем информацию о другом пользователе для личного чата
    let otherUser = null;
    if (chat.type === 'PRIVATE') {
      const otherParticipant = chat.participants.find(p => p.userId !== userId);
      if (otherParticipant?.user) {
        otherUser = normalizeUserAvatar(otherParticipant.user);
      }
    }

    return NextResponse.json({
      chat: {
        id: chat.id,
        type: chat.type,
        name: chat.name,
        isNew,
        otherUser: otherUser ? {
          id: otherUser.id,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          middleName: otherUser.middleName,
          avatarUrl: otherUser.avatarUrl,
          phone: otherUser.phone,
        } : null,
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
