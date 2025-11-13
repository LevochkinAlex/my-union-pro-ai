import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenRouterConfig } from "@/lib/settings";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import type { Prisma } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatMessagePayload = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RetrievedChunk = {
  id: string;
  knowledgeBaseId: string;
  content: string;
  similarity: number;
};

const defaultBotInclude = {
  knowledgeBases: {
    include: {
      knowledgeBase: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  apiProvider: true,
} as const satisfies Prisma.ChatBotInclude;

type DefaultBot = Prisma.ChatBotGetPayload<{
  include: typeof defaultBotInclude;
}>;

function resolveProviderOverride(bot: DefaultBot): Record<string, unknown> | null {
  const raw = bot.providerOverride;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

// Получение активного бота по умолчанию
async function getDefaultBot() {
  const bot = await prisma.chatBot.findFirst({
    where: {
      isActive: true,
      isDefault: true,
    },
    include: defaultBotInclude,
  });

  return bot;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));

  if (!magnitudeA || !magnitudeB) {
    return 0;
  }

  return dot / (magnitudeA * magnitudeB);
}

// Поиск релевантных фрагментов в базах знаний
async function retrieveRelevantChunks(bot: DefaultBot, query: string): Promise<RetrievedChunk[]> {
  const kbIds = (bot.knowledgeBases || []).map((rel) => rel.knowledgeBaseId);
  if (kbIds.length === 0) {
    return [];
  }

  try {
    // Пока работаем без embeddings - просто возвращаем все chunks
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        knowledgeBaseId: { in: kbIds },
      },
      take: 10,
    });

    // Возвращаем все chunks с фиксированной similarity
    return chunks.map((chunk) => ({
      id: chunk.id,
      knowledgeBaseId: chunk.knowledgeBaseId,
      content: chunk.content,
      similarity: 1.0, // Все chunks считаем релевантными
    }));
  } catch (error) {
    console.error("Ошибка поиска релевантных фрагментов:", error);
    return [];
  }
}

// Формирование системного промпта с учетом настроек бота и релевантных документов
async function buildSystemPrompt(bot: DefaultBot, chunks: RetrievedChunk[]): Promise<string> {
  let prompt = bot.systemPrompt;

  // Добавляем контекст, если есть
  if (bot.context) {
    prompt += `\n\nКонтекст:\n${bot.context}`;
  }

  if (chunks.length > 0) {
    const kbNameMap = new Map(
      (bot.knowledgeBases || []).map((relation) => [relation.knowledgeBaseId, relation.knowledgeBase?.name ?? "База знаний"]),
    );

    prompt += `\n\nАктуальные материалы (используй их как факты, указывай их происхождение при ответе):\n`;
    chunks.forEach((chunk, index) => {
      const kbName = kbNameMap.get(chunk.knowledgeBaseId) ?? "База знаний";
      prompt += `\n[${index + 1}] ${kbName} (релевантность ${chunk.similarity.toFixed(2)}):\n${chunk.content}\n`;
    });
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { message, chatBotId } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Сообщение обязательно" },
        { status: 400 }
      );
    }

    // Получаем бота - либо переданный, либо default
    let bot: DefaultBot | null = null;
    
    if (chatBotId) {
      // Use specified bot (e.g., Appeal Bot)
      bot = await prisma.chatBot.findUnique({
        where: { id: chatBotId },
        include: defaultBotInclude,
      });
    } else {
      // Use default bot
      bot = await getDefaultBot();
    }
    
    if (!bot) {
      return NextResponse.json(
        { error: "AI бот не настроен. Обратитесь к администратору." },
        { status: 503 }
      );
    }

    const relevantChunks = await retrieveRelevantChunks(bot, message);

    // Формируем системный промпт с учетом настроек бота
    const systemPrompt = await buildSystemPrompt(bot, relevantChunks);

    // Получаем историю сообщений пользователя
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 50, // Последние 50 сообщений
    });

    // Формируем массив сообщений для OpenRouter
    const messages: ChatMessagePayload[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...chatHistory.map((msg) => ({
        role: msg.role as ChatMessagePayload["role"],
        content: msg.content,
      })),
      {
        role: "user",
        content: message,
      },
    ];

    // Сохраняем сообщение пользователя
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        role: "user",
        content: message,
        chatBotId: bot.id,
      },
    });

    // Получаем настройки провайдера
    const overrideConfig = resolveProviderOverride(bot);
    const providerName =
      (typeof overrideConfig?.provider === "string" ? overrideConfig.provider : undefined) ||
      bot.apiProvider?.name ||
      "openrouter";

    const providerApiKey =
      (typeof overrideConfig?.apiKey === "string" ? overrideConfig.apiKey : undefined) ||
      bot.apiProvider?.apiKey ||
      "";

    const providerApiBaseUrl =
      (typeof overrideConfig?.apiBaseUrl === "string" ? overrideConfig.apiBaseUrl : undefined) ||
      bot.apiProvider?.apiBaseUrl ||
      "";

    const overrideHeaders =
      overrideConfig && typeof overrideConfig.headers === "object" && !Array.isArray(overrideConfig.headers)
        ? (overrideConfig.headers as Record<string, unknown>)
        : null;

    // Определяем API конфигурацию в зависимости от провайдера бота
    let apiUrl: string | undefined;
    let apiKey: string | undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (overrideHeaders && typeof overrideHeaders === "object") {
      for (const [key, value] of Object.entries(overrideHeaders)) {
        if (typeof value === "string" && value.trim().length > 0) {
          headers[key] = value;
        }
      }
    }

    if (providerName === "openrouter") {
      const openRouterConfig = await getOpenRouterConfig();
      apiKey = providerApiKey || openRouterConfig.apiKey || "";
      apiUrl = providerApiBaseUrl || OPENROUTER_API_URL;
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"] = process.env.NEXTAUTH_URL || "http://localhost:3004";
      headers["X-Title"] = "MyUnion Pro";
    } else if (providerName === "openai") {
      apiKey = providerApiKey || "";
      apiUrl = providerApiBaseUrl || "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (providerName === "anthropic") {
      apiKey = providerApiKey || "";
      apiUrl = providerApiBaseUrl || "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (providerName === "custom") {
      apiKey = providerApiKey || "";
      apiUrl = providerApiBaseUrl || "";
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    } else if (bot.apiProvider?.apiBaseUrl || providerApiBaseUrl) {
      // Любой другой провайдер из таблицы
      apiKey = providerApiKey || "";
      apiUrl = bot.apiProvider?.apiBaseUrl || providerApiBaseUrl || "";
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    } else {
      // Fallback на OpenRouter
      const openRouterConfig = await getOpenRouterConfig();
      apiKey = openRouterConfig.apiKey || "";
      apiUrl = OPENROUTER_API_URL;
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"] = process.env.NEXTAUTH_URL || "http://localhost:3004";
      headers["X-Title"] = "MyUnion Pro";
    }

    if (!apiKey || !apiUrl) {
      console.error("[chat] API ключ или URL не настроены");
      return NextResponse.json(
        { error: "AI недоступен. Обратитесь к администратору." },
        { status: 503 },
      );
    }
    
    console.log(`[chat] Конфигурация:`, {
      provider: providerName,
      apiUrl,
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey?.substring(0, 8) + '...',
      model: bot.model,
      headersKeys: Object.keys(headers),
    });

    // Формируем тело запроса в зависимости от провайдера
    let requestBody: Record<string, unknown>;
    if (providerName === "anthropic") {
      // Anthropic использует другой формат
      requestBody = {
        model: bot.model,
        max_tokens: bot.maxTokens,
        messages: messages.filter((m) => m.role !== "system"),
        system: messages.find((m) => m.role === "system")?.content || "",
      };
    } else {
      // OpenAI/OpenRouter/прочие формат
      requestBody = {
        model: bot.model,
        messages,
        temperature: bot.temperature,
        max_tokens: bot.maxTokens,
      };
    }

    // Отправляем запрос в API
    console.log(`[chat] Отправка запроса к ${providerName}:`, { apiUrl, model: bot.model, messagesCount: messages.length });
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log(`[chat] ${providerName} ответил со статусом:`, response.status, response.statusText);
    
    // Проверяем Content-Type перед парсингом
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const errorText = await response.text();
      console.error(`[chat] ${providerName} вернул не-JSON (${contentType}):`, errorText.substring(0, 500));
      return NextResponse.json(
        { error: `AI сервис вернул некорректный ответ. Проверьте настройки API ключа и модели.` },
        { status: 503 }
      );
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[chat] ${providerName} API error:`, errorData);
      let errorMessage = "Ошибка при обращении к AI";
      try {
        const errorJson = JSON.parse(errorData);
        errorMessage = errorJson.error?.message || errorJson.error || errorMessage;
      } catch {
        // Если не JSON, используем текст ошибки
        if (errorData) {
          errorMessage = errorData.substring(0, 200);
        }
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log(`[chat] ${providerName} успешно ответил`);
    // Обрабатываем разные форматы ответов
    let aiResponse: string;
    if (providerName === "anthropic") {
      aiResponse = data.content?.[0]?.text || data.content || "Извините, не удалось получить ответ.";
    } else {
      aiResponse = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "Извините, не удалось получить ответ.";
    }

    // Проверяем полноту профиля и добавляем маркер завершения если нужно
    try {
      const allMessages = await prisma.chatMessage.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
      });

      // Проверяем, есть ли уже маркер
      const hasCompleteMarker = allMessages.some(
        msg => msg.role === "assistant" && msg.content.includes("[PROFILE_COMPLETE]")
      );

      // Если маркера нет, проверяем полноту профиля
      if (!hasCompleteMarker) {
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
        });

        // Проверяем, заполнены ли все необходимые поля профиля
        const isProfileComplete = 
          user?.firstName &&
          user?.lastName &&
          user?.dateOfBirth &&
          user?.phone &&
          user?.address &&
          user?.jobTitle &&
          user?.profession &&
          user?.education;

        if (isProfileComplete) {
          aiResponse += "\n\n[PROFILE_COMPLETE]";
        }
      }
    } catch (error) {
      console.error("[chat] Error checking profile completeness:", error);
      // Don't fail the chat if profile check fails
    }

    // Сохраняем ответ AI
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        role: "assistant",
        content: aiResponse,
        chatBotId: bot.id,
      },
    });

    // Send push notification to user
    try {
      const internalToken = process.env.INTERNAL_API_TOKEN;
      await fetch(`${process.env.NEXTAUTH_URL || "http://localhost:3004"}/api/push/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": internalToken || "",
        },
        body: JSON.stringify({
          userId: session.user.id,
          title: bot.name || "AI Assistant",
          message: aiResponse.substring(0, 100) + (aiResponse.length > 100 ? "..." : ""),
          data: {
            type: "chat_message",
            chatBotId: bot.id,
          },
        }),
      });
    } catch (pushError) {
      console.warn("[chat] Push notification failed:", pushError);
      // Don't fail the chat if push fails
    }

    return NextResponse.json({
      message: aiResponse,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("Error details:", errorMessage, errorStack);
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}

// GET - получение истории сообщений
export async function GET() {
  console.log("GET /api/chat: Получен запрос");
  try {
    console.log("GET /api/chat: Попытка получить сессию...");
    const session = await getServerSession(authOptions);
    console.log("GET /api/chat: Сессия получена:", session ? `для пользователя ${session.user?.id}` : "сессия отсутствует");

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    
    console.log(`GET /api/chat: Поиск сообщений для пользователя ${session.user.id}...`);
    const messages = await prisma.chatMessage.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });
    console.log(`GET /api/chat: Найдено ${messages.length} сообщений.`);

    if (messages.length === 0) {
      console.log("GET /api/chat: Сообщений нет, создаем приветствие.");
      console.log("GET /api/chat: Поиск бота по умолчанию...");
      const defaultBot = await getDefaultBot();
      if (!defaultBot) {
        console.error("GET /api/chat: Критическая ошибка - бот по умолчанию не найден!");
        throw new Error("Бот по умолчанию не сконфигурирован в базе данных.");
      }
      console.log(`GET /api/chat: Бот по умолчанию найден: ${defaultBot.name}`);
      
      const welcomeMessageContent = "Здравствуйте! Я — ваш персональный ассистент MyUnion Pro. Я помогу вам составить заявления для вступления в профсоюз и для перечисления членских взносов. Давайте начнем! Как я могу к вам обращаться (назовите, пожалуйста, ваши фамилию, имя и отчество)?";
      
      console.log("GET /api/chat: Создание приветственного сообщения в БД...");
      const welcomeMessage = await prisma.chatMessage.create({
        data: {
          content: welcomeMessageContent,
          role: "assistant",
          userId: session.user.id,
          chatBotId: defaultBot.id,
        },
      });
      console.log("GET /api/chat: Приветственное сообщение создано. ID:", welcomeMessage.id);
      return NextResponse.json({ messages: [welcomeMessage] });
    }

    console.log("GET /api/chat: Возвращаем историю сообщений.");
    return NextResponse.json({ messages });
    
  } catch (error) {
    console.error("!!! GET /api/chat КРИТИЧЕСКАЯ ОШИБКА:", error);
    // ВРЕМЕННО: возвращаем детали ошибки для отладки
    return NextResponse.json(
      { 
        error: "Внутренняя ошибка сервера",
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

