import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { saveChatConversationToKnowledgeBase } from "@/lib/chat-knowledge-learning";
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

    // Загружаем сообщения с пагинацией
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
        replyTo: {
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
        },
        forwardedFrom: {
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
        },
      },
      orderBy: {
        createdAt: direction === "older" ? "desc" : "asc",
      },
      take: limit,
    });

    // Если загружаем старые сообщения, переворачиваем порядок
    const orderedMessages = direction === "older" ? messages.reverse() : messages;

    // Проверяем, есть ли еще сообщения для загрузки
    const hasMore = messages.length === limit;
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
    messages.forEach((msg: any) => {
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
    const messagesWithReactions = messages.map((msg: any) => {
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
        const { retrieveRelevantChunks } = await import("@/lib/vector-search");
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
            // Поиск релевантных chunks
            const chunks = await retrieveRelevantChunks(content.trim(), bot.id, 5);

            // Строим системный промпт
            const userName = user.firstName || user.email?.split("@")[0] || "друг";
            const userOrg = user.organization?.name || "не указана";
            const systemPrompt = `Ты AI-помощник профсоюза МООП РЗ. Твоя задача - помогать пользователям ориентироваться в системе MyUnion.

### КОНТЕКСТ ПОЛЬЗОВАТЕЛЯ:
- Имя: ${userName}
- Организация: ${userOrg}
- Email: ${user.email || "не указан"}

### ТВОЯ РОЛЬ:
Ты помощник-консультант, который:
- Отвечает на вопросы о системе MyUnion
- Подсказывает, где найти нужную информацию
- Объясняет, как использовать функции платформы
- Помогает с навигацией по сайту
- Отвечает на вопросы о профсоюзе, скидках, документах

### БАЗА ЗНАНИЙ:
${chunks.length > 0 ? chunks.map((chunk, i) => `\n[Документ ${i + 1}]\n${chunk.content}`).join("\n\n") : "База знаний пуста"}

Отвечай кратко и по делу. Будь дружелюбным и тёплым.`;

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

