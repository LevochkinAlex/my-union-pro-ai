import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retrieveRelevantChunks } from "@/lib/vector-search";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { saveChatConversationToKnowledgeBase } from "@/lib/chat-knowledge-learning";
import type { ChatBot, ApiProvider } from "@prisma/client";

/**
 * Простой чат-бот помощник для всех страниц
 * Не генерирует документы, не создает сессии
 * Просто отвечает на вопросы о системе
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[assistant/chat] Starting request...");
    
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.log("[assistant/chat] Not authorized");
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { message } = await request.json();
    console.log("[assistant/chat] Message received:", message?.substring(0, 50));

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Сообщение не может быть пустым" },
        { status: 400 }
      );
    }

    // Получаем пользователя с профилем
    console.log("[assistant/chat] Getting user...");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        organization: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }
    console.log("[assistant/chat] User found:", user.email);

    // Получаем бота по умолчанию
    console.log("[assistant/chat] Getting bot...");
    const bot = await prisma.chatBot.findFirst({
      where: { isActive: true },
      include: {
        apiProvider: true,
      },
    });

    if (!bot) {
      console.log("[assistant/chat] No active bot found");
      return NextResponse.json(
        { error: "Бот не настроен" },
        { status: 500 }
      );
    }
    console.log("[assistant/chat] Bot found:", bot.name, "model:", bot.model);

    // Поиск релевантных чанков из базы знаний (не блокируем если ошибка)
    console.log("[assistant/chat] Retrieving chunks...");
    let chunks: any[] = [];
    try {
      chunks = await retrieveRelevantChunks(message, bot.id, 5);
      console.log("[assistant/chat] Chunks retrieved:", chunks.length);
    } catch (chunkError) {
      console.error("[assistant/chat] Error retrieving chunks (continuing without):", chunkError);
    }

    // Строим системный промпт
    const systemPrompt = buildSystemPrompt(user, chunks);

    // Получаем или создаем пользователя-бота
    console.log("[assistant/chat] Getting or creating bot user...");
    let botUser;
    try {
      botUser = await getOrCreateAIBotUser();
      console.log("[assistant/chat] Bot user:", botUser.id);
    } catch (botUserError) {
      console.error("[assistant/chat] Error getting bot user:", botUserError);
      throw botUserError;
    }

    // Получаем или создаем чат с ботом
    const userId = session.user.id;
    const participant1Id = userId < botUser.id ? userId : botUser.id;
    const participant2Id = userId < botUser.id ? botUser.id : userId;

    let chat = await prisma.chat.findUnique({
      where: {
        participant1Id_participant2Id: {
          participant1Id,
          participant2Id,
        },
      },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          participant1Id,
          participant2Id,
        },
      });
    }

    // Загружаем историю сообщений из чата для контекста
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        chatId: chat.id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 20, // Последние 20 сообщений
    });

    // Преобразуем историю в формат для AI
    const conversationHistory = chatHistory.map((msg) => ({
      role: msg.senderId === botUser.id ? "assistant" : "user",
      content: msg.content,
    }));

    // Сохраняем сообщение пользователя
    const userMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: userId,
        content: message.trim(),
      },
    });

    // Формируем историю сообщений для контекста (обновляем с учетом сохраненного сообщения)
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Последние 10 сообщений для контекста
      { role: "user", content: message },
    ];

    // Отправляем запрос к AI с обновленной историей
    console.log("[assistant/chat] Calling AI...");
    let aiResponse;
    try {
      aiResponse = await callAI(bot, messages);
      console.log("[assistant/chat] AI response received, length:", aiResponse?.length);
    } catch (aiError) {
      console.error("[assistant/chat] Error calling AI:", aiError);
      throw aiError;
    }

    // Сохраняем ответ бота
    const botMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: botUser.id,
        content: aiResponse,
      },
    });

    // Обновляем последнее сообщение в чате
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessage: aiResponse.substring(0, 200),
        lastMessageAt: new Date(),
        ...(chat.participant1Id === userId
          ? { participant2ReadAt: null }
          : { participant1ReadAt: null }),
      },
    });

    // Сохраняем переписку в базу знаний для обучения бота (асинхронно, не блокируем ответ)
    saveChatConversationToKnowledgeBase(
      bot.id,
      message.trim(),
      aiResponse,
      userId,
      chat.id,
      botMessage.id
    ).catch((error) => {
      console.error("[assistant/chat] Error saving conversation to knowledge base:", error);
    });

    return NextResponse.json({
      message: aiResponse,
      id: botMessage.id,
      chatId: chat.id,
    });
  } catch (error) {
    console.error("[assistant/chat] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при обработке запроса" },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(user: any, chunks: any[]): string {
  const userName = user.firstName || user.email?.split("@")[0] || "друг";
  const userOrg = user.organization?.name || "не указана";

  let prompt = `Ты AI-помощник профсоюза МООП РЗ. Твоя задача - помогать пользователям ориентироваться в системе MyUnion.

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

### СТРОГО ЗАПРЕЩЕНО:
- НЕ генерируй документы
- НЕ создавай заявления
- НЕ проси заполнять анкеты
- НЕ создавай сессии чата
- НЕ предлагай функции, которых нет в системе

### ФУНКЦИИ СИСТЕМЫ (рассказывай о них):

**1. Главная страница (/dashboard)**
- Свежие новости профсоюза
- Новые учетные записи на платформе
- Свежие скидки от партнеров

**2. Документы (/dashboard/documents)**
- Просмотр заявлений
- Скачивание документов
- Загрузка подписанных документов
- Отслеживание статуса проверки

**3. Новости (/dashboard/news)**
- Новости профсоюза и отрасли
- Важные объявления
- Опросы и голосования

**4. Скидки (/dashboard/discounts)**
- Скидки 10-50% в ресторанах, магазинах, онлайн-сервисах от партнеров профсоюза
- Фильтр по городу
- Категории: Еда, Товары, Услуги, Красота, Развлечения
- Активация промокодов
- Если пользователь спрашивает про скидки, дай подробную инструкцию:
  1. Перейди в раздел "Скидки" в меню или по ссылке /dashboard/discounts
  2. Выбери интересующую категорию или используй поиск
  3. Примени фильтр по городу, если нужно
  4. Нажми "Активировать" на понравившейся скидке
  5. Получи промокод и используй его при покупке
  6. В разделе "Мои скидки" (/dashboard/discounts/my) можно посмотреть все активированные предложения

**5. Профиль (/dashboard/profile)**
- Личные данные
- Информация об организации
- Настройки уведомлений

### СТИЛЬ ОБЩЕНИЯ:
- Будь дружелюбным и тёплым
- Обращайся по имени: "${userName}"
- Не используй эмодзи в ответах
- Давай конкретные и полезные ответы
- Предлагай конкретные ссылки и разделы, когда это уместно
- Если не знаешь ответ - честно скажи

### БАЗА ЗНАНИЙ:
${chunks.length > 0 ? chunks.map((chunk, i) => `\n[Документ ${i + 1}]\n${chunk.content}`).join("\n\n") : "База знаний пуста"}

### ВАЖНО:
- Отвечай кратко и по делу
- Фокусируйся на помощи с навигацией и использованием системы
- Не придумывай функции, которых нет
- НИКОГДА не упоминай названия технических провайдеров (OpenRouter, Open AI, Anthropic и т.д.)
- Если спросят про модель или технологию - отвечай общими фразами типа "использую современные AI-технологии" или "работаю на базе искусственного интеллекта"
- НИКОГДА не упоминай название "BestBenefits" - говори только "партнеры" или "партнеры профсоюза"`;

  return prompt;
}

export async function callAI(bot: ChatBot & { apiProvider: ApiProvider | null }, messages: any[]): Promise<string> {
  const providerName = bot.apiProvider?.name || "openrouter";
  const apiKey = bot.apiProvider?.apiKey || process.env.OPENROUTER_API_KEY || "";
  const apiBaseUrl = bot.apiProvider?.apiBaseUrl || "https://openrouter.ai/api/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (providerName === "openrouter") {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = process.env.NEXTAUTH_URL || "http://localhost:3004";
    headers["X-Title"] = "MyUnion Pro";
  } else if (providerName === "openai") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (providerName === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  const model = bot.model || "openai/gpt-4o-mini";

  let requestBody: any;
  let responseUrl: string;

  if (providerName === "anthropic") {
    responseUrl = apiBaseUrl || "https://api.anthropic.com/v1/messages";
    requestBody = {
      model,
      max_tokens: 1024,
      messages: messages.filter((m) => m.role !== "system"),
      system: messages.find((m) => m.role === "system")?.content || "",
    };
  } else {
    responseUrl = apiBaseUrl;
    requestBody = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    };
  }

  const response = await fetch(responseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[assistant/chat] AI API error:", errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();

  if (providerName === "anthropic") {
    return data.content?.[0]?.text || "Извините, не удалось получить ответ.";
  } else {
    return data.choices?.[0]?.message?.content || "Извините, не удалось получить ответ.";
  }
}

