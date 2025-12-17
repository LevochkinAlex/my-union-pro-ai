import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { normalizeUserAvatar } from "@/lib/api-helpers";

// Проверка доступности prisma
if (!prisma) {
  console.error("[chat] Prisma client is not initialized");
}

// GET - получение списка чатов пользователя
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем доступность prisma
    if (!prisma || !prisma.chat) {
      console.error("[chat] GET: Prisma client or Chat model is not available");
      return NextResponse.json(
        { error: "Ошибка инициализации базы данных" },
        { status: 500 }
      );
    }

    const userId = session.user.id;

    // Получаем пользователя-бота (не критично, если не получится)
    let botUser = null;
    try {
      botUser = await getOrCreateAIBotUser();
    } catch (error) {
      console.error("[chat] Error getting bot user:", error);
      // Продолжаем выполнение, даже если не удалось получить бота
    }

    // Получаем все чаты, где пользователь является участником
    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId },
        ],
      },
      include: {
        participant1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            phone: true,
            email: true,
          },
        },
        participant2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Оптимизация: получаем все непрочитанные сообщения одним запросом
    const chatIds = chats.map((chat) => chat.id);
    const unreadCountsMap = new Map<string, number>();
    
    if (chatIds.length > 0) {
      // Для каждого чата получаем условие для непрочитанных сообщений
      const unreadConditions = chats
        .map((chat) => {
          const lastReadAt = chat.participant1Id === userId
            ? chat.participant1ReadAt
            : chat.participant2ReadAt;
          
          if (!lastReadAt) {
            // Если нет времени прочтения, но есть последнее сообщение - считаем все непрочитанными
            if (chat.lastMessageAt) {
              return {
                chatId: chat.id,
                senderId: { not: userId },
                deletedAt: null,
              };
            }
            return null;
          }
          
          return {
            chatId: chat.id,
            senderId: { not: userId },
            createdAt: { gt: lastReadAt },
            deletedAt: null,
          };
        })
        .filter(Boolean) as any[];

      // Выполняем запросы параллельно для каждого чата (но это все равно лучше чем N+1)
      const unreadCountsPromises = unreadConditions.map(async (condition) => {
        const count = await prisma.chatMessage.count({ where: condition });
        return { chatId: condition.chatId, count };
      });

      const unreadCountsResults = await Promise.all(unreadCountsPromises);
      unreadCountsResults.forEach(({ chatId, count }) => {
        unreadCountsMap.set(chatId, count);
      });
    }
    
    // Формируем массив счетчиков в том же порядке, что и чаты
    const unreadCounts = chats.map((chat) => {
      const lastReadAt = chat.participant1Id === userId
        ? chat.participant1ReadAt
        : chat.participant2ReadAt;

      if (!lastReadAt && chat.lastMessageAt) {
        // Если есть последнее сообщение, но нет времени прочтения
        return unreadCountsMap.get(chat.id) || 1;
      }

      return unreadCountsMap.get(chat.id) || 0;
    });

    // Форматируем чаты для ответа
    const formattedChats = chats.map((chat, index) => {
      const otherUser = chat.participant1Id === userId ? chat.participant2 : chat.participant1;
      const normalizedUser = normalizeUserAvatar(otherUser);

      return {
        id: chat.id,
        otherUser: {
          id: normalizedUser.id,
          firstName: normalizedUser.firstName,
          lastName: normalizedUser.lastName,
          middleName: normalizedUser.middleName,
          avatarUrl: normalizedUser.avatarUrl,
          phone: normalizedUser.phone,
        },
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.lastMessageAt,
        unreadCount: unreadCounts[index] || 0,
        createdAt: chat.createdAt,
      };
    });

    return NextResponse.json({ chats: formattedChats });
  } catch (error: any) {
    console.error("[chat] GET Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
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

    // Проверяем доступность prisma
    if (!prisma || !prisma.chat) {
      console.error("[chat] POST: Prisma client or Chat model is not available");
      return NextResponse.json(
        { error: "Ошибка инициализации базы данных" },
        { status: 500 }
      );
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
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Определяем порядок участников (меньший ID всегда participant1)
    const participant1Id = userId < targetUserId ? userId : targetUserId;
    const participant2Id = userId < targetUserId ? targetUserId : userId;

    // Ищем существующий чат или создаем новый
    let chat = await prisma.chat.findUnique({
      where: {
        participant1Id_participant2Id: {
          participant1Id,
          participant2Id,
        },
      },
      include: {
        participant1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            phone: true,
          },
        },
        participant2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            phone: true,
          },
        },
      },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          participant1Id,
          participant2Id,
        },
        include: {
          participant1: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
              phone: true,
            },
          },
          participant2: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
              phone: true,
            },
          },
        },
      });
    }

    const otherUser = chat.participant1Id === userId ? chat.participant2 : chat.participant1;
    const normalizedUser = normalizeUserAvatar(otherUser);

    return NextResponse.json({
      chat: {
        id: chat.id,
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
    console.error("[chat] POST Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
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

