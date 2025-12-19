import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import { getOrCreatePrivateChat } from "@/lib/chat-server-utils";
import * as Sentry from "@sentry/nextjs";

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

    // Используем Sentry span для отслеживания производительности
    const result = await Sentry.startSpan(
      {
        op: "db.query",
        name: "GET /api/chat - fetch user chats",
      },
      async (span) => {
        span.setAttribute("userId", userId);

        // Получаем пользователя-бота (не критично, если не получится)
        let botUser = null;
        try {
          botUser = await getOrCreateAIBotUser();
        } catch (error) {
          Sentry.captureException(error);
          console.error("[chat] Error getting bot user:", error);
          // Продолжаем выполнение, даже если не удалось получить бота
        }

        // Получаем все чаты, где пользователь является участником
        const chats = await prisma.chat.findMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId },
          // Также включаем групповые чаты, где пользователь участник
          {
            type: "GROUP",
            participants: {
              some: {
                userId: userId,
                leftAt: null,
              },
            },
          },
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
        ticket: {
          select: {
            id: true,
            publicId: true,
            title: true,
          },
        },
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
            messages: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    // Оптимизация: используем groupBy для подсчёта непрочитанных за ОДИН запрос
    const chatIds = chats.map((chat) => chat.id);
    const unreadCountsMap = new Map<string, number>();
    
    if (chatIds.length > 0) {
      try {
        // Один запрос с группировкой вместо множества отдельных count запросов
        const unreadCounts = await prisma.chatMessage.groupBy({
          by: ['chatId'],
          where: {
            chatId: { in: chatIds },
            senderId: { not: userId },
            deletedAt: null,
          },
          _count: {
            id: true,
          },
        });
        
        // Заполняем Map с учётом времени прочтения
        for (const chat of chats) {
          const lastReadAt = chat.participant1Id === userId
            ? chat.participant1ReadAt
            : chat.participant2ReadAt;
          
          // Находим общий счётчик для этого чата
          const chatCount = unreadCounts.find(c => c.chatId === chat.id);
          
          if (!chatCount) {
            unreadCountsMap.set(chat.id, 0);
            continue;
          }
          
          // Если нет времени прочтения - все сообщения непрочитаны
          if (!lastReadAt) {
            unreadCountsMap.set(chat.id, chatCount._count.id);
          } else {
            // Считаем только сообщения после времени прочтения
            // Делаем это эффективно - берём значение из groupBy (все чужие сообщения)
            // и позже при необходимости уточним
            unreadCountsMap.set(chat.id, chatCount._count.id);
          }
        }
        
        // Если есть чаты с lastReadAt, нужно уточнить подсчёт
        const chatsWithReadAt = chats.filter(c => {
          const lastReadAt = c.participant1Id === userId ? c.participant1ReadAt : c.participant2ReadAt;
          return lastReadAt !== null;
        });
        
        if (chatsWithReadAt.length > 0 && chatsWithReadAt.length <= 20) {
          // Только для небольшого числа чатов делаем уточняющий запрос
          const refinedCounts = await Promise.all(
            chatsWithReadAt.map(async (chat) => {
              const lastReadAt = chat.participant1Id === userId 
                ? chat.participant1ReadAt 
                : chat.participant2ReadAt;
              
              const count = await prisma.chatMessage.count({
                where: {
                  chatId: chat.id,
                  senderId: { not: userId },
                  createdAt: { gt: lastReadAt! },
                  deletedAt: null,
                },
              });
              return { chatId: chat.id, count };
            })
          );
          
          refinedCounts.forEach(({ chatId, count }) => {
            unreadCountsMap.set(chatId, count);
          });
        }
      } catch (error) {
        console.error("[chat] Error counting unread messages:", error);
        // При ошибке оставляем нули
      }
    }
    
    // Формируем массив счетчиков в том же порядке, что и чаты
    const unreadCounts = chats.map((chat) => unreadCountsMap.get(chat.id) || 0);

        // Форматируем чаты для ответа
        const formattedChats = chats.map((chat, index) => {
          let otherUserData: any = null;

          if (chat.type === "GROUP") {
            // Для GROUP чатов (обращения) показываем название чата и кол-во участников
            // Находим другого участника (не текущего пользователя)
            const otherParticipant = chat.participants?.find((p: any) => p.userId !== userId);
            const otherUser = otherParticipant?.user;
            
            // Определяем название чата
            const chatName = chat.name || "Чат";
            
            otherUserData = {
              id: chat.id, // Используем ID чата как ID
              // Ставим в lastName название чата, чтобы getUserName вернул его
              firstName: null,
              lastName: chatName,
              middleName: null,
              avatarUrl: chat.iconUrl || null,
              phone: null,
              isGroup: true,
              participantsCount: chat._count?.participants || 0,
              // Если это чат обращения, добавляем инфо о другом участнике
              otherParticipantName: otherUser ? `${otherUser.firstName || ""} ${otherUser.lastName || ""}`.trim() : null,
            };
          } else {
            // Для PRIVATE чатов - обычная логика
            const otherUser = chat.participant1Id === userId ? chat.participant2 : chat.participant1;
            const normalizedUser = otherUser ? normalizeUserAvatar(otherUser) : null;
            
            otherUserData = normalizedUser ? {
              id: normalizedUser.id,
              firstName: normalizedUser.firstName,
              lastName: normalizedUser.lastName,
              middleName: normalizedUser.middleName,
              avatarUrl: normalizedUser.avatarUrl,
              phone: normalizedUser.phone,
            } : {
              id: "",
              firstName: null,
              lastName: null,
              middleName: null,
              avatarUrl: null,
              phone: null,
            };
          }

          return {
            id: chat.id,
            type: chat.type || "PRIVATE",
            name: chat.name,
            description: chat.description,
            iconUrl: chat.iconUrl,
            isPublic: chat.isPublic,
            otherUser: otherUserData,
            lastMessage: chat.lastMessage,
            lastMessageAt: chat.lastMessageAt,
            unreadCount: unreadCounts[index] || 0,
            createdAt: chat.createdAt,
            // Ticket fields for appeal chats
            ticketId: chat.ticket?.id || null,
            ticketPublicId: chat.ticket?.publicId || null,
            ticketTitle: chat.ticket?.title || null,
            // Group participants
            participants: chat.type === "GROUP" ? chat.participants?.map((p: any) => ({
              id: p.id,
              userId: p.userId,
              user: p.user ? normalizeUserAvatar(p.user) : null,
              role: p.role,
            })) : [],
            participantsCount: chat._count?.participants || 0,
            _count: chat._count,
          };
        });

        span.setAttribute("chatsCount", formattedChats.length);
        return { chats: formattedChats };
      }
    );

    return NextResponse.json(result);
  } catch (error: any) {
    Sentry.captureException(error);
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

    // Используем утилиту для создания/поиска чата с нормализацией ID
    let chat = await getOrCreatePrivateChat(userId, targetUserId);

    // Загружаем полную информацию о чате с участниками
    const chatWithParticipants = await prisma.chat.findUnique({
      where: { id: chat.id },
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

    if (!chatWithParticipants || !chatWithParticipants.participant1 || !chatWithParticipants.participant2) {
      // Это не должно произойти, но на всякий случай
      return NextResponse.json({ error: "Ошибка создания чата" }, { status: 500 });
    }

    const otherUser = chatWithParticipants.participant1Id === userId 
      ? chatWithParticipants.participant2 
      : chatWithParticipants.participant1;
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

