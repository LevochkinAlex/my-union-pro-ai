import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar, normalizeUsersAvatars } from "@/lib/api-helpers";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { saveChatConversationToKnowledgeBase } from "@/lib/chat-knowledge-learning";
import { saveUserInteractionToKnowledgeBase } from "@/lib/user-knowledge-base";
import { sendUserNotification } from "@/lib/notifications";
import { withCache, getCacheKey } from "@/lib/cache";
import { invalidateChatCache } from "@/lib/cache-invalidation";
import { 
  requireChatAccess, 
  ChatAccessError,
  markAsRead,
  getChatParticipantIds,
} from "@/lib/chat-service";
import * as Sentry from "@sentry/nextjs";

// GET - получение сообщений чата
export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  const startTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем доступ через новый сервис
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Получаем параметры пагинации
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const cursor = searchParams.get("cursor");
    const direction = searchParams.get("direction") || "newest";

    // Строим условие WHERE
    const whereClause: any = {
      chatId,
      deletedAt: null,
    };

    // TODO: Переделать на Matrix API для получения сообщений
    // Сообщения теперь хранятся в Matrix, не в БД
    // if (cursor) {
    //   const cursorMessage = await prisma.chatMessage.findUnique({...});
    // }

    // Получаем информацию о чате с matrixRoomId
    const chatInfo = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        type: true,
        name: true,
        matrixRoomId: true,
      },
    });

    // Загружаем сообщения
    const messages = await Sentry.startSpan(
      {
        op: "db.query",
        name: "GET /api/chat/[chatId] - fetch messages",
      },
      async (span) => {
        span.setAttribute("chatId", chatId);
        span.setAttribute("limit", limit);

        const shouldCache = !cursor && limit <= 50;
        const cacheKey = shouldCache 
          ? getCacheKey(`chat:messages:${chatId}`, { limit })
          : null;

        // TODO: Переделать на Matrix API - сообщения теперь хранятся в Matrix
        const fetchMessages = async () => [] as any[];

        if (shouldCache && cacheKey) {
          return withCache(cacheKey, fetchMessages, 60); // Увеличили кеш до 60 сек
        }
        return fetchMessages();
      }
    );

    // Переворачиваем для правильного отображения
    const orderedMessages = [...messages].reverse();

    // Пагинация
    const hasMore = messages.length === limit;
    const oldestMessageId = orderedMessages.length > 0 ? orderedMessages[0].id : null;
    const newestMessageId = orderedMessages.length > 0 ? orderedMessages[orderedMessages.length - 1].id : null;

    // Обрабатываем реакции
    const allUserIds = new Set<string>();
    const hasReactions = messages.some((msg: any) => 
      msg.reactions && typeof msg.reactions === 'object' && Object.keys(msg.reactions).length > 0
    );
    
    if (hasReactions) {
      messages.forEach((msg: any) => {
        if (msg.reactions && typeof msg.reactions === 'object') {
          Object.values(msg.reactions).forEach((reactionData: any) => {
            let userIds: string[] = [];
            if (Array.isArray(reactionData)) {
              userIds = reactionData;
            } else if (reactionData?.userIds && Array.isArray(reactionData.userIds)) {
              userIds = reactionData.userIds;
            }
            userIds.forEach((id: string) => id && allUserIds.add(id));
          });
        }
      });
    }

    const reactionUsers = allUserIds.size > 0 
      ? await withCache(
          getCacheKey("users:reactions", { userIds: Array.from(allUserIds).sort().join(",") }),
          async () => prisma.user.findMany({
            where: { id: { in: Array.from(allUserIds) } },
            select: { id: true, firstName: true, lastName: true, middleName: true, avatarUrl: true },
          }),
          300
        )
      : [];

    const normalizedReactionUsers = normalizeUsersAvatars(reactionUsers);

    // Форматируем сообщения
    const messagesWithReactions = orderedMessages.map((msg: any) => {
      const normalizedSender = msg.sender ? normalizeUserAvatar(msg.sender) : msg.sender;
      const normalizedReplySender = msg.replyTo?.sender ? normalizeUserAvatar(msg.replyTo.sender) : msg.replyTo?.sender;
      
      const normalizedMsg = {
        ...msg,
        sender: normalizedSender,
        replyTo: msg.replyTo ? { ...msg.replyTo, sender: normalizedReplySender } : msg.replyTo,
      };

      if (msg.reactions && typeof msg.reactions === 'object' && !Array.isArray(msg.reactions)) {
        try {
          const reactionsWithUsers: Record<string, { userIds: string[]; users: any[] }> = {};
          Object.entries(msg.reactions).forEach(([emoji, reactionData]: [string, any]) => {
            let userIds: string[] = [];
            if (Array.isArray(reactionData)) {
              userIds = reactionData;
            } else if (reactionData && typeof reactionData === 'object' && Array.isArray(reactionData.userIds)) {
              userIds = reactionData.userIds;
            }
            
            if (userIds.length > 0) {
              reactionsWithUsers[emoji] = {
                userIds,
                users: normalizedReactionUsers.filter((u) => userIds.includes(u.id)),
              };
            }
          });
          return {
            ...normalizedMsg,
            reactions: reactionsWithUsers,
          };
        } catch (e) {
          console.error("[chat] Error formatting reactions:", e);
          return normalizedMsg;
        }
      }
      return normalizedMsg;
    });

    const duration = Date.now() - startTime;
    console.log(`[chat] GET /api/chat/${chatId} - ${messagesWithReactions.length} messages in ${duration}ms`);
    
    return NextResponse.json({ 
      messages: messagesWithReactions,
      chat: chatInfo,
      pagination: {
        hasMore,
        oldestMessageId,
        newestMessageId,
        count: messagesWithReactions.length,
      },
    });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat] GET Error:", error?.message);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// POST - отправка сообщения в чат
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
    const { content, replyToId } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    // Проверяем доступ
    let chat: any;
    try {
      const accessResult = await requireChatAccess(chatId, userId);
      chat = accessResult.chat;
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // TODO: Проверка replyToId теперь через Matrix API
    // if (replyToId) {
    //   const replyToMessage = await getMatrixMessage(...);
    // }

    // Получаем полную информацию о чате
    const fullChat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        type: true,
        name: true,
      },
    });

    // TODO: Отправка сообщения через Matrix API
    // Получаем Matrix токен и отправляем через sendMatrixMessage
    if (!chat.matrixRoomId) {
      return NextResponse.json(
        { error: "Чат не связан с Matrix комнатой" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { matrixAccessToken: true, matrixUserId: true },
    });

    if (!user?.matrixAccessToken) {
      return NextResponse.json(
        { error: "Matrix аккаунт не настроен" },
        { status: 500 }
      );
    }

    const { sendMatrixMessage, replyToThread } = await import('@/lib/matrix-messages');
    let messageEventId: string | null = null;

    if (replyToId) {
      // Отправляем reply в тред
      messageEventId = await replyToThread(
        user.matrixAccessToken,
        chat.matrixRoomId,
        replyToId, // Matrix event_id
        content.trim()
      );
    } else {
      // Обычное сообщение
      messageEventId = await sendMatrixMessage(
        user.matrixAccessToken,
        chat.matrixRoomId,
        content.trim()
      );
    }

    if (!messageEventId) {
      return NextResponse.json(
        { error: "Не удалось отправить сообщение" },
        { status: 500 }
      );
    }

    // Получаем информацию об отправителе
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
      },
    });

    const message = {
      id: messageEventId,
      chatId,
      senderId: userId,
      content: content.trim(),
      replyToId: replyToId || null,
      sender: sender,
      createdAt: new Date(),
    };

    const normalizedMessage = {
      ...message,
      sender: normalizeUserAvatar(message.sender),
    };

    // Получаем получателей
    const recipientIds = await getChatParticipantIds(chatId, userId);
    const isGroupChat = fullChat?.type === "GROUP";

    // Проверяем, является ли это чатом с ботом
    const botUser = await getOrCreateAIBotUser();
    const isBotChat = !isGroupChat && recipientIds.length === 1 && recipientIds[0] === botUser.id;

    // Обработка чата с ботом
    if (isBotChat) {
      try {
        const botResponse = await handleBotChat(chatId, userId, content, botUser, message);
        if (botResponse) {
          return NextResponse.json({ 
            message: normalizedMessage,
            botMessage: botResponse,
          });
        }
      } catch (botError) {
        console.error("[chat] Error getting bot response:", botError);
      }
    }

    // Обновляем чат
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
      },
    });

    // Сбрасываем readAt для всех участников кроме отправителя
    await prisma.chatParticipant.updateMany({
      where: {
        chatId,
        userId: { not: userId },
        leftAt: null,
      },
      data: {
        readAt: null,
      },
    });

    // Старая схема удалена - все обновления через ChatParticipant выше

    // Инвалидируем кеш
    await invalidateChatCache(chatId);

    // Отправляем уведомления
    // ВАЖНО: recipientIds содержит ТОЛЬКО участников конкретного чата, а не всех председателей
    // Личные сообщения (PRIVATE без ticketId) обрабатываются как обычные сообщения
    // Обращения (с ticketId) обрабатываются как обращения, но уведомления идут только участникам чата
    if (recipientIds.length > 0 && !isBotChat) {
      await sendNotifications(chatId, userId, content, recipientIds, isGroupChat, fullChat?.name);
    }

    return NextResponse.json({ message: normalizedMessage });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat] POST Error:", error?.message);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// Обработка чата с AI ботом
async function handleBotChat(
  chatId: string,
  userId: string,
  content: string,
  botUser: any,
  userMessage: any
): Promise<any | null> {
  const { enhancedSearch, formatSearchResultsForPrompt } = await import("@/lib/chat-enhanced-search");
  
  const bot = await prisma.chatBot.findFirst({
    where: { isActive: true },
    include: { apiProvider: true },
  });

  if (!bot) return null;

  const chatHistory = await prisma.chatMessage.findMany({
    where: { chatId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });

  if (!user) return null;

  const searchResults = await enhancedSearch(content.trim(), bot.id, userId);
  const formattedSearchInfo = formatSearchResultsForPrompt(searchResults);

  const userName = user.firstName || user.email?.split("@")[0] || "друг";
  const userOrg = user.organization?.name || "не указана";

  const systemPrompt = `Ты умный и дружелюбный AI-ассистент. Ты можешь помочь с любыми вопросами.

Пользователь: ${userName}
Его организация: ${userOrg}

${formattedSearchInfo ? `### ДАННЫЕ:\n${formattedSearchInfo}` : ""}

Правила:
- Используй информацию из данных выше если она есть
- Будь полезным, дружелюбным и конкретным`;

  const conversationHistory = chatHistory.map((msg) => ({
    role: msg.senderId === botUser.id ? "assistant" : "user",
    content: msg.content,
  }));

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-10),
    { role: "user", content: content.trim() },
  ];

  const assistantRoute = await import("@/app/api/assistant/chat/route");
  const aiResponse = await assistantRoute.callAI(bot, messages);

  const botMessage = await prisma.chatMessage.create({
    data: {
      chatId,
      senderId: botUser.id,
      content: aiResponse,
    } as any,
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
        },
      },
    },
  });

  // Сохраняем в базу знаний
  saveChatConversationToKnowledgeBase(
    bot.id,
    content.trim(),
    aiResponse,
    userId,
    chatId,
    botMessage.id
  ).catch(console.error);

  saveUserInteractionToKnowledgeBase(
    userId,
    content.trim(),
    aiResponse,
    { chatId, messageId: userMessage.id, botMessageId: botMessage.id, botId: bot.id }
  ).catch(console.error);

  // Обновляем чат
  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessageAt: new Date(),
    },
  });

  return {
    ...botMessage,
    sender: normalizeUserAvatar(botMessage.sender),
  };
}

// Отправка уведомлений
async function sendNotifications(
  chatId: string,
  senderId: string,
  content: string,
  recipientIds: string[],
  isGroupChat: boolean,
  chatName?: string | null
) {
  try {
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { firstName: true, lastName: true, middleName: true },
    });

    const senderName = sender 
      ? `${sender.firstName || ""} ${sender.lastName || ""}`.trim() || "Пользователь"
      : "Пользователь";

    // Проверяем, связан ли чат с обращением
    // ВАЖНО: только чаты с ticketId являются обращениями
    // Личные сообщения (PRIVATE без ticketId) НЕ должны обрабатываться как обращения
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        type: true,
        ticket: {
          select: {
            id: true,
            publicId: true,
            title: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                middleName: true,
              },
            },
          },
        },
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    const messagePreview = content.trim().substring(0, 100);

    // Если чат связан с обращением (есть ticketId), создаем уведомление об обращении
    // Личные сообщения (без ticketId) обрабатываются как обычные сообщения
    // Уведомления отправляются ТОЛЬКО участникам конкретного чата (recipientIds), а не всем председателям
    if (chat?.ticket) {
      const ticket = chat.ticket;
      const ticketOwnerName = ticket.user
        ? [ticket.user.lastName, ticket.user.firstName, ticket.user.middleName].filter(Boolean).join(" ") || "Пользователь"
        : "Пользователь";
      
      // Форматируем publicId для отображения
      const formattedPublicId = ticket.publicId.length === 8
        ? `${ticket.publicId.slice(0, 4)}-${ticket.publicId.slice(4)}`
        : ticket.publicId;

      await Promise.all(
        recipientIds.map((recipientId) =>
          sendUserNotification({
            userId: recipientId,
            type: "ticket_response",
            title: `Обращение #${formattedPublicId}: ${ticketOwnerName}`,
            body: messagePreview,
            url: `${baseUrl}/dashboard/appeals/${ticket?.id}`,
            senderName,
          }).catch((err) => {
            console.error(`[chat] Error sending notification to ${recipientId}:`, err?.message);
            return { push: false, email: false };
          })
        )
      );
    } else {
      // Обычное уведомление о сообщении в чате
    await Promise.all(
      recipientIds.map((recipientId) =>
        sendUserNotification({
          userId: recipientId,
          type: "chat_message",
          title: isGroupChat 
            ? `💬 ${chatName || "Групповой чат"}: ${senderName}`
            : `💬 Новое сообщение от ${senderName}`,
          body: messagePreview,
          url: isGroupChat
            ? `${baseUrl}/dashboard/chats/ppo-head?chatId=${chatId}`
            : `${baseUrl}/dashboard/chat?chatId=${chatId}`,
          senderName,
        }).catch((err) => {
          console.error(`[chat] Error sending notification to ${recipientId}:`, err?.message);
          return { push: false, email: false };
        })
      )
    );
    }
  } catch (error: any) {
    console.error("[chat] Error sending notifications:", error?.message);
  }
}
