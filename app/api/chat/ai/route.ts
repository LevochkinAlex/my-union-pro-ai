import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUserInteractionToKnowledgeBase } from "@/lib/user-knowledge-base";
import { invalidateChatCache, invalidateUserChatsCache } from "@/lib/chat-redis";
import { enhancedSearch, formatSearchResultsForPrompt } from "@/lib/chat-enhanced-search";
import { callAI, buildAssistantSystemPrompt } from "@/lib/ai-call";
import * as Sentry from "@sentry/nextjs";
import { isDemoUserId } from "@/lib/demo";
import { getRequestUserId } from "@/lib/api-request-user";

const AI_CHAT_NAME = "ИИ-Ассистент";
const AI_BOT_ID = "ai-assistant-bot"; // Виртуальный ID бота

/**
 * GET /api/chat/ai
 * Получить или создать чат с ИИ-ассистентом
 */
export async function GET(request: NextRequest) {
  let sentryUserId: string | undefined;
  try {
    const requestUser = await getRequestUserId(request);

    if (!requestUser) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = requestUser.id;
    sentryUserId = userId;

    // Демо: возвращаем мок-чат для демо-пользователей
    if (isDemoUserId(userId)) {
      const now = new Date().toISOString();
      return NextResponse.json({
        chat: {
          id: "demo-ai-chat",
          type: "PRIVATE" as const,
          name: AI_CHAT_NAME,
          description: "Персональный ИИ-помощник по профсоюзным вопросам",
          iconUrl: null,
          isPublic: false,
          lastMessage: null,
          lastMessageAt: now,
          unreadCount: 0,
          createdAt: now,
          otherUser: { id: AI_BOT_ID, firstName: "ИИ", lastName: "Ассистент", middleName: null, avatarUrl: null, isBot: true },
          participants: [],
          participantsCount: 1,
          _count: { messages: 1 },
          isAIChat: true,
        },
      });
    }

    // Ищем существующий чат с ИИ для пользователя
    let aiChat = await prisma.chat.findFirst({
      where: {
        type: "PRIVATE",
        name: AI_CHAT_NAME,
        participants: {
          some: {
            userId: userId,
            leftAt: null,
          },
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
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    // Если чата нет, создаём его
    if (!aiChat) {
      aiChat = await prisma.chat.create({
        data: {
          type: "PRIVATE",
          name: AI_CHAT_NAME,
          description: "Персональный ИИ-помощник по профсоюзным вопросам",
          isPublic: false,
          participants: {
            create: [
              {
                userId: userId,
                role: "member",
              },
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
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: { messages: true },
          },
        },
      });

      // Отправляем приветственное сообщение от бота
      // ВАЖНО: Используем специальный формат для ИИ-сообщений
      const welcomeMessage = `Здравствуйте! Я ИИ-Ассистент МойСоюз.

Я помогу вам с вопросами о:
- Профсоюзном членстве и взносах
- Оформлении документов и заявлений
- Правовых вопросах и трудовых спорах
- Льготах и скидках для членов профсоюза
- Работе приложения МойСоюз

Задайте свой вопрос, и я постараюсь помочь!`;

      await prisma.chatMessage.create({
        data: {
          chatId: aiChat.id,
          senderId: userId, // Используем userId, но помечаем как assistant
          content: welcomeMessage,
          messageType: "assistant", // Помечаем как сообщение от ассистента
        },
      });
    }

    // Форматируем ответ
    const response = {
      id: aiChat.id,
      type: "PRIVATE" as const,
      name: AI_CHAT_NAME,
      description: aiChat.description,
      iconUrl: null,
      isPublic: false,
      lastMessage: aiChat.messages[0]?.content || null,
      lastMessageAt: aiChat.messages[0]?.createdAt || aiChat.createdAt,
      unreadCount: 0,
      createdAt: aiChat.createdAt,
      // Виртуальный "другой пользователь" - бот
      otherUser: {
        id: AI_BOT_ID,
        firstName: "ИИ",
        lastName: "Ассистент",
        middleName: null,
        avatarUrl: null,
        isBot: true,
      },
      participants: aiChat.participants,
      participantsCount: aiChat.participants.length,
      _count: aiChat._count,
      isAIChat: true,
    };

    return NextResponse.json({ chat: response });
  } catch (error: any) {
    console.error("[chat/ai] GET error:", error);
    Sentry.captureException(error, {
      tags: { endpoint: 'GET /api/chat/ai' },
      extra: { userId: sentryUserId },
    });
    // Возвращаем 200 с пустым чатом, чтобы клиент не падал и не ретраил бесконечно
    return NextResponse.json({
      chat: null,
      error: "Ошибка при получении чата с ИИ",
      details: process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
  }
}

/**
 * POST /api/chat/ai
 * Отправить сообщение в чат с ИИ и получить ответ
 */
export async function POST(request: NextRequest) {
  let chatId: string | undefined;
  let sentryUserId: string | undefined;
  try {
    const requestUser = await getRequestUserId(request);

    if (!requestUser) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = requestUser.id;
    sentryUserId = userId;
    const body = await request.json();
    const { content, chatId: bodyChatId } = body;
    chatId = bodyChatId;

    if (!content?.trim()) {
      return NextResponse.json({ error: "Сообщение не может быть пустым" }, { status: 400 });
    }

    // Демо: возвращаем мок-ответ от ИИ для демо-пользователей
    if (isDemoUserId(userId)) {
      const now = new Date();
      const demoResponses = [
        "Спасибо за вопрос! В демо-режиме я показываю, как работает ИИ-ассистент. В реальном режиме я помогу с любыми профсоюзными вопросами.",
        "Это демо-версия ИИ-ассистента. После регистрации вы сможете задавать вопросы о членстве, льготах, документах и трудовых правах.",
        "Отличный вопрос! В полной версии я могу помочь с оформлением документов, разъяснить права членов профсоюза и подсказать про доступные льготы.",
      ];
      const randomResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];
      
      return NextResponse.json({
        userMessage: {
          id: `demo-user-msg-${Date.now()}`,
          content: content.trim(),
          senderId: userId,
          sender: { id: userId, firstName: "Демо", lastName: "Пользователь", avatarUrl: null },
          messageType: "text",
          createdAt: now.toISOString(),
        },
        botMessage: {
          id: `demo-bot-msg-${Date.now()}`,
          content: randomResponse,
          senderId: AI_BOT_ID,
          sender: { id: AI_BOT_ID, firstName: "ИИ", lastName: "Ассистент", avatarUrl: null },
          messageType: "assistant",
          createdAt: new Date(now.getTime() + 1000).toISOString(),
        },
      });
    }

    // Находим чат ИИ: по chatId или любой чат пользователя с именем ИИ-Ассистент (на случай удалённого чата)
    let chat = chatId
      ? await prisma.chat.findFirst({
          where: {
            id: chatId,
            name: AI_CHAT_NAME,
            participants: {
              some: { userId: userId, leftAt: null },
            },
          },
        })
      : null;

    if (!chat) {
      chat = await prisma.chat.findFirst({
        where: {
          name: AI_CHAT_NAME,
          participants: {
            some: { userId: userId, leftAt: null },
          },
        },
      });
    }

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          type: "PRIVATE",
          name: AI_CHAT_NAME,
          description: "Персональный ИИ-помощник по профсоюзным вопросам",
          isPublic: false,
          participants: {
            create: [{ userId: userId, role: "member" }],
          },
        },
      });
    }

    // Сохраняем сообщение пользователя
    const userMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: userId,
        content: content.trim(),
        messageType: "text",
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Обновляем lastMessageAt в чате
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessageId: userMessage.id,
        lastMessageAt: userMessage.createdAt,
      },
    });

    // Получаем ответ от ИИ через существующий API
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: НЕ устанавливаем дефолтное сообщение об ошибке заранее
    // Если произойдет ошибка, она должна быть проброшена дальше
    let aiResponse: string;

    try {
      console.log(`[chat/ai] ========== CALLING AI DIRECTLY ==========`);
      console.log(`[chat/ai] Chat ID: ${chat.id}, User ID: ${userId}`);

      // Загрузка бота
      const bot = await prisma.chatBot.findFirst({
        where: { isActive: true },
        include: { apiProvider: true },
      });
      if (!bot) {
        throw new Error("Бот не настроен. Обратитесь к администратору.");
      }
      const hasYandex =
        !!process.env.YANDEX_AI_STUDIO_API_KEY && !!process.env.YANDEX_CLOUD_FOLDER_ID;
      if (!hasYandex && !bot.apiProvider?.apiKey) {
        throw new Error("AI провайдер не настроен. Обратитесь к администратору.");
      }

      // Загрузка пользователя для системного промпта
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { organization: true },
      });

      // Расширенный поиск по базе знаний
      let formattedSearchInfo = "";
      try {
        const searchResults = await enhancedSearch(content.trim(), bot.id, userId);
        formattedSearchInfo = formatSearchResultsForPrompt(searchResults);
        console.log(`[chat/ai] Enhanced search: knowledge=${searchResults.knowledgeBaseChunks.length}, orgs=${searchResults.organizationInfo.length}`);
      } catch (searchErr) {
        console.warn("[chat/ai] Enhanced search failed (continuing):", searchErr);
      }

      const systemPrompt = buildAssistantSystemPrompt(
        user || { firstName: null, email: null, organization: null },
        formattedSearchInfo,
      );

      // История сообщений для контекста
      const history = await prisma.chatMessage.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { content: true, senderId: true, messageType: true },
      });

      const messagesForAI = history
        .reverse()
        .filter((m) => m.messageType !== "system")
        .map((m) => ({
          role: m.senderId === userId ? "user" : "assistant",
          content: m.content,
        }));

      console.log(`[chat/ai] Messages for AI: ${messagesForAI.length}`);

      const messages = [
        { role: "system", content: systemPrompt },
        ...messagesForAI.slice(-10),
      ];

      aiResponse = await callAI(bot, messages, {
        route: "chat/ai",
        userId,
        organizationId: (user as { organizationId?: string | null } | null)?.organizationId ?? null,
      });

      if (!aiResponse || aiResponse.trim().length === 0) {
        throw new Error("ИИ вернул пустой ответ");
      }

      console.log(`[chat/ai] ✅ AI response received, length: ${aiResponse.length}`);
    } catch (aiError: any) {
      console.error("[chat/ai] ❌ ========== AI EXCEPTION ==========");
      console.error("[chat/ai] Error:", aiError?.message);
      throw aiError;
    }

    // Сохраняем ответ ИИ
    const botMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: userId, // Используем userId, т.к. бот виртуальный
        content: aiResponse,
        messageType: "assistant", // Помечаем как сообщение от ассистента
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Обновляем lastMessageAt
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessageId: botMessage.id,
        lastMessageAt: botMessage.createdAt,
      },
    });

    // Инвалидация кэша чата, чтобы при следующей загрузке сообщений ответ ИИ не пропадал
    await Promise.all([
      invalidateChatCache(chat.id),
      invalidateUserChatsCache(userId),
    ]).catch((err) => console.warn("[chat/ai] Cache invalidation error:", err));

    // Сохраняем взаимодействие в персональную базу знаний пользователя (супер-админка: под каждым пользователем)
    saveUserInteractionToKnowledgeBase(
      userId,
      content.trim(),
      aiResponse,
      {
        chatId: chat.id,
        userMessageId: userMessage.id,
        botMessageId: botMessage.id,
      }
    ).catch((err) => {
      console.error("[chat/ai] Error saving interaction to user knowledge base:", err);
    });

    return NextResponse.json({
      chatId: chat.id,
      userMessage: {
        id: userMessage.id,
        content: userMessage.content,
        senderId: userMessage.senderId,
        sender: userMessage.sender,
        messageType: userMessage.messageType,
        createdAt: userMessage.createdAt,
      },
      botMessage: {
        id: botMessage.id,
        content: botMessage.content,
        senderId: AI_BOT_ID, // Возвращаем виртуальный ID бота
        sender: {
          id: AI_BOT_ID,
          firstName: "ИИ",
          lastName: "Ассистент",
          avatarUrl: null,
        },
        messageType: botMessage.messageType,
        createdAt: botMessage.createdAt,
      },
    });
  } catch (error: any) {
    console.error("[chat/ai] ❌ ========== POST FATAL ERROR ==========");
    console.error("[chat/ai] Error type:", error?.name);
    console.error("[chat/ai] Error message:", error?.message);
    console.error("[chat/ai] Error stack:", error?.stack?.substring(0, 1000));
    console.error("[chat/ai] User ID:", sentryUserId);
    console.error("[chat/ai] Chat ID:", chatId);
    
    Sentry.captureException(error, {
      tags: { endpoint: 'POST /api/chat/ai' },
      extra: { userId: sentryUserId, chatId },
    });
    
    const statusCode = (error as any)?.statusCode || (error as any)?.status || 500;
    const errorMessage = error?.message || "Ошибка при отправке сообщения";
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: statusCode }
    );
  }
}
