import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { saveChatConversationToKnowledgeBase } from "@/lib/chat-knowledge-learning";
import { saveUserInteractionToKnowledgeBase } from "@/lib/user-knowledge-base";
import { sendUserNotification } from "@/lib/notifications";

// GET - получение сообщений чата
export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем доступность prisma
    if (!prisma || !prisma.chat || !prisma.chatMessage) {
      console.error("[chat] GET: Prisma client or models are not available");
      return NextResponse.json(
        { error: "Ошибка инициализации базы данных" },
        { status: 500 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Получаем параметры пагинации из query string
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10); // По умолчанию 50 сообщений
    const cursor = searchParams.get("cursor"); // ID сообщения для курсорной пагинации
    const direction = searchParams.get("direction") || "newest"; // "newest" или "older"

    // Оптимизация: загружаем только последние N сообщений
    // Если указан cursor, загружаем сообщения до/после него
    const whereClause: any = {
      chatId,
      deletedAt: null,
    };

    if (cursor) {
      // Находим сообщение-курсор для определения позиции
      const cursorMessage = await prisma.chatMessage.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        if (direction === "older") {
          // Загружаем сообщения старше курсора
          whereClause.createdAt = { lt: cursorMessage.createdAt };
        } else {
          // Загружаем сообщения новее курсора
          whereClause.createdAt = { gt: cursorMessage.createdAt };
        }
      }
    }

    // ОПТИМИЗАЦИЯ: Загружаем сообщения с минимальными include для ускорения
    // replyTo и forwardedFrom загружаются отдельно только для тех сообщений, где они есть
    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
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
        attachments: {
          select: {
            id: true,
            type: true,
            fileName: true,
            originalName: true,
            filePath: true,
            fileSize: true,
            mimeType: true,
          },
        },
        // ОПТИМИЗАЦИЯ: Убрали вложенные include для replyTo и forwardedFrom
        // Они загружаются ниже только если нужны
      },
      orderBy: {
        createdAt: direction === "older" ? "desc" : "asc",
      },
      take: limit,
    });
    
    // ОПТИМИЗАЦИЯ: Загружаем replyTo и forwardedFrom отдельно, только для сообщений где они есть
    const messageIds = messages.map(m => m.id);
    const replyToIds = messages.filter(m => m.replyToId).map(m => m.replyToId).filter(Boolean) as string[];
    const forwardedFromIds = messages.filter(m => m.forwardedFromId).map(m => m.forwardedFromId).filter(Boolean) as string[];
    
    const [replyToMessages, forwardedFromMessages] = await Promise.all([
      replyToIds.length > 0 ? prisma.chatMessage.findMany({
        where: { id: { in: replyToIds } },
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
      }) : [],
      forwardedFromIds.length > 0 ? prisma.chatMessage.findMany({
        where: { id: { in: forwardedFromIds } },
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
      }) : [],
    ]);
    
    // Создаем мапы для быстрого доступа
    const replyToMap = new Map(replyToMessages.map(m => [m.id, m]));
    const forwardedFromMap = new Map(forwardedFromMessages.map(m => [m.id, m]));
    
    // Добавляем replyTo и forwardedFrom к сообщениям
    const messagesWithReplies = messages.map(msg => ({
      ...msg,
      replyTo: msg.replyToId ? replyToMap.get(msg.replyToId) : null,
      forwardedFrom: msg.forwardedFromId ? forwardedFromMap.get(msg.forwardedFromId) : null,
    }));

    // Если загружаем старые сообщения, переворачиваем порядок
    const orderedMessages = direction === "older" ? messagesWithReplies.reverse() : messagesWithReplies;

    // Проверяем, есть ли еще сообщения для загрузки
    const hasMore = messagesWithReplies.length === limit;
    const oldestMessageId = orderedMessages.length > 0 ? orderedMessages[0].id : null;
    const newestMessageId = orderedMessages.length > 0 ? orderedMessages[orderedMessages.length - 1].id : null;

    // Отмечаем сообщения как прочитанные и обновляем время активности
    // Это используется для определения, открыт ли чат (для пуш-уведомлений)
    await prisma.chat.update({
      where: { id: chatId },
      data: chat.participant1Id === userId
        ? { participant1ReadAt: new Date() }
        : { participant2ReadAt: new Date() },
    });

    // Получаем информацию о пользователях для реакций
    const allUserIds = new Set<string>();
    messagesWithReplies.forEach((msg: any) => {
      if (msg.reactions && typeof msg.reactions === 'object') {
        try {
          Object.values(msg.reactions).forEach((reactionData: any) => {
            // Поддерживаем два формата:
            // 1. Старый: { emoji: string[] } - массив userIds напрямую
            // 2. Новый: { emoji: { userIds: string[], users: ... } } - объект с userIds
            let userIds: string[] = [];
            if (Array.isArray(reactionData)) {
              // Старый формат - массив напрямую
              userIds = reactionData;
            } else if (reactionData && typeof reactionData === 'object' && Array.isArray(reactionData.userIds)) {
              // Новый формат - объект с userIds
              userIds = reactionData.userIds;
            }
            
            userIds.forEach((id: string) => {
              if (id && typeof id === 'string') {
                allUserIds.add(id);
              }
            });
          });
        } catch (e) {
          console.error("[chat] Error processing reactions:", e);
        }
      }
    });

    const reactionUsers = allUserIds.size > 0 ? await prisma.user.findMany({
      where: {
        id: { in: Array.from(allUserIds) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
      },
    }) : [];

    // Формируем реакции с информацией о пользователях
    const messagesWithReactions = messagesWithReplies.map((msg: any) => {
      if (msg.reactions && typeof msg.reactions === 'object' && !Array.isArray(msg.reactions)) {
        try {
          const reactionsWithUsers: Record<string, { userIds: string[]; users: any[] }> = {};
          Object.entries(msg.reactions).forEach(([emoji, reactionData]: [string, any]) => {
            // Поддерживаем два формата:
            // 1. Старый: { emoji: string[] } - массив userIds напрямую
            // 2. Новый: { emoji: { userIds: string[], users: ... } } - объект с userIds
            let userIds: string[] = [];
            if (Array.isArray(reactionData)) {
              // Старый формат - массив напрямую
              userIds = reactionData;
            } else if (reactionData && typeof reactionData === 'object' && Array.isArray(reactionData.userIds)) {
              // Новый формат - объект с userIds
              userIds = reactionData.userIds;
            }
            
            if (userIds.length > 0) {
              reactionsWithUsers[emoji] = {
                userIds,
                users: reactionUsers.filter((u) => userIds.includes(u.id)),
              };
            }
          });
          return {
            ...msg,
            reactions: reactionsWithUsers,
          };
        } catch (e) {
          console.error("[chat] Error formatting reactions:", e);
          return msg;
        }
      }
      return msg;
    });

    return NextResponse.json({ 
      messages: messagesWithReactions,
      pagination: {
        hasMore,
        oldestMessageId,
        newestMessageId,
        count: messagesWithReactions.length,
      },
    });
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

    // Проверяем доступность prisma
    if (!prisma || !prisma.chat || !prisma.chatMessage) {
      console.error("[chat] POST: Prisma client or models are not available");
      return NextResponse.json(
        { error: "Ошибка инициализации базы данных" },
        { status: 500 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;
    const { content, replyToId } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    // Проверяем, что сообщение для ответа существует и принадлежит этому чату
    if (replyToId) {
      const replyToMessage = await prisma.chatMessage.findUnique({
        where: { id: replyToId },
        select: { chatId: true },
      });

      if (!replyToMessage) {
        return NextResponse.json({ error: "Сообщение для ответа не найдено" }, { status: 404 });
      }

      if (replyToMessage.chatId !== chatId) {
        return NextResponse.json({ error: "Сообщение для ответа не принадлежит этому чату" }, { status: 403 });
      }
    }

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Создаем сообщение
    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: userId,
        content: content.trim(),
        replyToId: replyToId || null,
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

    // Определяем получателя сообщения
    const recipientId = chat.participant1Id === userId 
      ? chat.participant2Id 
      : chat.participant1Id;

    // Проверяем, является ли получатель ботом
    const botUser = await getOrCreateAIBotUser();
    const isBotChat = recipientId === botUser.id;

    // Получаем информацию о чате с временем последнего чтения
    const chatWithReadTime = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1ReadAt: true,
        participant2ReadAt: true,
      },
    });

    // Проверяем, открыт ли чат у получателя
    // Чат считается открытым, если получатель запрашивал сообщения в последние 30 секунд
    const recipientReadAt = chat.participant1Id === userId
      ? chatWithReadTime?.participant2ReadAt
      : chatWithReadTime?.participant1ReadAt;

    const isChatOpen = recipientReadAt 
      ? (Date.now() - new Date(recipientReadAt).getTime()) < 30000 // 30 секунд
      : false;

    // Если это чат с ботом, получаем ответ от бота
    if (isBotChat) {
      try {
        // Импортируем функции для работы с ботом
        const { enhancedSearch, formatSearchResultsForPrompt } = await import("@/lib/chat-enhanced-search");
        const bot = await prisma.chatBot.findFirst({
          where: { isActive: true },
          include: { apiProvider: true },
        });

        if (bot) {
          // Загружаем историю чата
          const chatHistory = await prisma.chatMessage.findMany({
            where: {
              chatId: chat.id,
              deletedAt: null,
            },
            orderBy: { createdAt: "asc" },
            take: 20,
          });

          // Получаем пользователя
          const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { organization: true },
          });

          if (user) {
            // Расширенный поиск информации из всех источников (включая персональную базу знаний пользователя)
            const searchResults = await enhancedSearch(content.trim(), bot.id, userId);
            const formattedSearchInfo = formatSearchResultsForPrompt(searchResults);

            // Строим системный промпт
            const userName = user.firstName || user.email?.split("@")[0] || "друг";
            const userOrg = user.organization?.name || "не указана";
            
            // Логируем что передаём боту
            console.log("[chat] Formatted search info length:", formattedSearchInfo?.length || 0);
            if (formattedSearchInfo && formattedSearchInfo.includes("ПРЕДСЕДАТЕЛЬ")) {
              console.log("[chat] ✅ Chairman info found in formatted search info");
            }
            
            const systemPrompt = `Ты умный и дружелюбный AI-ассистент. Ты можешь помочь с любыми вопросами.

Пользователь: ${userName}
Его организация: ${userOrg}

У тебя есть доступ к базе данных профсоюзов с информацией о председателях, контактах и организациях.

${formattedSearchInfo ? `### ⚠️ КРИТИЧЕСКИ ВАЖНО - ИСПОЛЬЗУЙ ЭТИ ДАННЫЕ:\n${formattedSearchInfo}\n\n### ИНСТРУКЦИИ:\n- Если выше есть информация о председателе - ОБЯЗАТЕЛЬНО назови его имя и должность\n- НИКОГДА не говори "не знаю" или "не имею информации", если данные есть выше\n- Если пользователь спрашивает про "наш председатель" или "у нас председатель" - используй данные для организации "${userOrg}"\n- Отвечай прямо, используя конкретные факты из данных выше` : "Дополнительная информация не найдена"}

Правила:
- КРИТИЧЕСКИ ВАЖНО: Если в данных выше есть ответ на вопрос - ОБЯЗАТЕЛЬНО используй эту информацию
- Если спрашивают о председателе и данные есть - НЕМЕДЛЕННО назови имя и должность
- Можешь отвечать на любые вопросы, не только о профсоюзах
- Будь полезным, дружелюбным и конкретным
- Только если информации НЕТ НИГДЕ - тогда честно скажи и предложи альтернативы`;

            // Формируем историю сообщений
            const conversationHistory = chatHistory.map((msg) => ({
              role: msg.senderId === botUser.id ? "assistant" : "user",
              content: msg.content,
            }));

            const messages = [
              { role: "system", content: systemPrompt },
              ...conversationHistory.slice(-10),
              { role: "user", content: content.trim() },
            ];

            // Вызываем AI (используем функцию из assistant/chat)
            const assistantRoute = await import("@/app/api/assistant/chat/route");
            const aiResponse = await assistantRoute.callAI(bot, messages);

            // Сохраняем ответ бота
            const botMessage = await prisma.chatMessage.create({
              data: {
                chatId: chat.id,
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

            // Сохраняем переписку в базу знаний для обучения
            saveChatConversationToKnowledgeBase(
              bot.id,
              content.trim(),
              aiResponse,
              userId,
              chat.id,
              botMessage.id
            ).catch((error) => {
              console.error("[chat] Error saving conversation to knowledge base:", error);
            });

            // Сохраняем взаимодействие в персональную базу знаний пользователя
            saveUserInteractionToKnowledgeBase(
              userId,
              content.trim(),
              aiResponse,
              {
                chatId: chat.id,
                messageId: message.id,
                botMessageId: botMessage.id,
                botId: bot.id,
              }
            ).catch((error) => {
              console.error("[chat] Error saving interaction to user knowledge base:", error);
            });

            // Обновляем последнее сообщение в чате
            await prisma.chat.update({
              where: { id: chatId },
              data: {
                lastMessage: aiResponse.substring(0, 200),
                lastMessageAt: new Date(),
                participant1ReadAt: new Date(),
                participant2ReadAt: new Date(),
              },
            });

            return NextResponse.json({ 
              message,
              botMessage, // Возвращаем также ответ бота
            });
          }
        }
      } catch (botError) {
        console.error("[chat] Error getting bot response:", botError);
        // Продолжаем выполнение, даже если бот не ответил
      }
    }

    // Обновляем последнее сообщение в чате
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessage: content.trim().substring(0, 100), // Первые 100 символов
        lastMessageAt: new Date(),
        // Сбрасываем прочитанность для получателя
        ...(chat.participant1Id === userId
          ? { participant2ReadAt: null }
          : { participant1ReadAt: null }),
      },
    });

    // Отправляем пуш-уведомление получателю (только если это не бот)
    // Отправляем всегда, но логируем статус открытости чата
    try {
      // Получаем информацию об отправителе для уведомления
      const sender = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
        },
      });

      const senderName = sender 
        ? `${sender.firstName || ""} ${sender.middleName || ""} ${sender.lastName || ""}`.trim() || "Пользователь"
        : "Пользователь";

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://myunion.pro";
      const messagePreview = content.trim().substring(0, 100);

      console.log("[chat] 📤 Отправка пуш-уведомления получателю:", {
        recipientId,
        senderName,
        chatId,
        isChatOpen,
        messagePreview: messagePreview.substring(0, 50),
      });

      const notificationResult = await sendUserNotification({
        userId: recipientId,
        type: "chat_message",
        title: `💬 Новое сообщение от ${senderName}`,
        body: messagePreview,
        url: `${baseUrl}/dashboard/chat?userId=${userId}`,
        senderName,
      });

      console.log("[chat] ✅ Уведомление отправлено получателю:", {
        pushSent: notificationResult?.push || false,
        emailSent: notificationResult?.email || false,
        isChatOpen,
      });
    } catch (notificationError: any) {
      console.error("[chat] ⚠️ Ошибка отправки пуш-уведомления:", {
        error: notificationError?.message,
        stack: notificationError?.stack,
        recipientId,
        chatId,
      });
      // Не прерываем отправку сообщения из-за ошибки уведомления
    }

    return NextResponse.json({ message });
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

