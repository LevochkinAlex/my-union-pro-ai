import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { saveChatConversationToKnowledgeBase } from "@/lib/chat-knowledge-learning";
import { saveUserInteractionToKnowledgeBase } from "@/lib/user-knowledge-base";
import { enhancedSearch, formatSearchResultsForPrompt } from "@/lib/chat-enhanced-search";
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

    // Расширенный поиск информации из всех источников (включая персональную базу знаний пользователя)
    console.log("[assistant/chat] Performing enhanced search...");
    let searchResults;
    try {
      searchResults = await enhancedSearch(message.trim(), bot.id, session.user.id);
      console.log("[assistant/chat] Enhanced search completed:", {
        knowledgeChunks: searchResults.knowledgeBaseChunks.length,
        organizations: searchResults.organizationInfo.length,
        webResults: searchResults.webSearchResults.length,
      });
    } catch (searchError) {
      console.error("[assistant/chat] Error in enhanced search (continuing without):", searchError);
      searchResults = {
        knowledgeBaseChunks: [],
        organizationInfo: [],
        webSearchResults: [],
      };
    }

    // Форматируем результаты поиска для промпта
    const formattedSearchInfo = formatSearchResultsForPrompt(searchResults);

    // Строим системный промпт с использованием расширенного поиска
    const systemPrompt = buildSystemPromptWithEnhancedSearch(user, formattedSearchInfo);

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
    const { getOrCreatePrivateChat } = await import("@/lib/chat-server-utils");
    const chat = await getOrCreatePrivateChat(userId, botUser.id);

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

    // Сохраняем взаимодействие в персональную базу знаний пользователя (асинхронно)
    saveUserInteractionToKnowledgeBase(
      userId,
      message.trim(),
      aiResponse,
      {
        chatId: chat.id,
        messageId: userMessage.id,
        botMessageId: botMessage.id,
        botId: bot.id,
      }
    ).catch((error) => {
      console.error("[assistant/chat] Error saving interaction to user knowledge base:", error);
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

/**
 * Поиск организации в базе данных по названию из запроса
 */
async function searchOrganizationInDatabase(message: string): Promise<any> {
  const messageLower = message.toLowerCase();
  
  // Извлекаем ключевые слова из сообщения
  const keywords: string[] = [];
  if (messageLower.includes("мооп")) keywords.push("МООП");
  if (messageLower.includes("рз")) keywords.push("РЗ");
  if (messageLower.includes("рф")) keywords.push("РФ");
  if (messageLower.includes("профсоюз")) keywords.push("профсоюз");
  
  // Если нет ключевых слов, пытаемся найти любую организацию, упомянутую в сообщении
  if (keywords.length === 0) {
    // Ищем организации, которые могут быть упомянуты в тексте
    const allOrgs = await prisma.organization.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        chairmanName: true,
        chairmanJobTitle: true,
        fullPath: true,
        address: true,
        phone: true,
        email: true,
      },
      take: 20,
    });
    
    // Ищем организацию, название которой упоминается в сообщении
    const matchingOrg = allOrgs.find(org => 
      messageLower.includes(org.name.toLowerCase()) ||
      org.name.toLowerCase().split(" ").some(word => 
        word.length > 3 && messageLower.includes(word.toLowerCase())
      )
    );
    
    if (matchingOrg) {
      return matchingOrg;
    }
  }
  
  // Ищем организации по ключевым словам
  if (keywords.length > 0) {
    // Сначала ищем федеральные организации (FEDERAL) - они имеют приоритет
    const federalOrgs = await prisma.organization.findMany({
      where: {
        type: "FEDERAL",
        OR: keywords.map(keyword => ({
          name: { contains: keyword, mode: "insensitive" as const },
        })),
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        chairmanName: true,
        chairmanJobTitle: true,
        fullPath: true,
        address: true,
        phone: true,
        email: true,
      },
      take: 10,
    });

    if (federalOrgs.length > 0) {
      // Ищем наиболее подходящую федеральную организацию
      const bestMatch = federalOrgs.find(org => {
        const orgNameLower = org.name.toLowerCase();
        return (
          messageLower.includes(orgNameLower) ||
          (orgNameLower.includes("мооп") && messageLower.includes("мооп")) ||
          (orgNameLower.includes("рз") && messageLower.includes("рз")) ||
          (orgNameLower.includes("рф") && messageLower.includes("рф"))
        );
      }) || federalOrgs[0];
      
      console.log("[assistant/chat] Found federal organization:", bestMatch.name, "chairman:", bestMatch.chairmanName);
      return bestMatch;
    }

    // Если не нашли федеральные, ищем все организации
    const organizations = await prisma.organization.findMany({
      where: {
        OR: keywords.map(keyword => ({
          name: { contains: keyword, mode: "insensitive" as const },
        })),
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        chairmanName: true,
        chairmanJobTitle: true,
        fullPath: true,
        address: true,
        phone: true,
        email: true,
      },
      orderBy: [
        { type: "asc" }, // Приоритет федеральным организациям
        { name: "asc" },
      ],
      take: 10,
    });

    if (organizations.length > 0) {
      // Ищем наиболее подходящую (содержит больше ключевых слов или полное совпадение)
      const bestMatch = organizations.find(org => {
        const orgNameLower = org.name.toLowerCase();
        return (
          messageLower.includes(orgNameLower) ||
          (orgNameLower.includes("мооп") && messageLower.includes("мооп")) ||
          (orgNameLower.includes("рз") && messageLower.includes("рз"))
        );
      }) || organizations[0];
      
      console.log("[assistant/chat] Found organization:", bestMatch.name, "chairman:", bestMatch.chairmanName);
      return bestMatch;
    }
    
    // Если точного совпадения нет, ищем по одному ключевому слову (начиная с "МООП")
    const priorityKeywords = keywords.sort((a, b) => {
      if (a === "МООП") return -1;
      if (b === "МООП") return 1;
      return 0;
    });
    
    for (const keyword of priorityKeywords) {
      const orgs = await prisma.organization.findMany({
        where: {
          name: { contains: keyword, mode: "insensitive" as const },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          type: true,
          chairmanName: true,
          chairmanJobTitle: true,
          fullPath: true,
          address: true,
          phone: true,
          email: true,
        },
        orderBy: [
          { type: "asc" }, // Приоритет федеральным организациям
          { name: "asc" },
        ],
        take: 5,
      });
      
      if (orgs.length > 0) {
        console.log("[assistant/chat] Found organization by keyword:", keyword, orgs[0].name, "chairman:", orgs[0].chairmanName);
        return orgs[0];
      }
    }
  }

  return null;
}

/**
 * Извлекает поисковый запрос для веб-поиска из сообщения
 */
function extractOrganizationSearchQuery(message: string): string | null {
  // Ищем упоминания организаций
  const orgMatch = message.match(/(МООП[^?]*|председатель[^?]*|руководитель[^?]*)/i);
  if (orgMatch) {
    return orgMatch[0].trim();
  }
  
  // Если есть вопрос о председателе, формируем запрос
  if (/председатель|руководитель|глава/i.test(message)) {
    const orgName = message.match(/(МООП[^?]*|РЗ[^?]*|РФ[^?]*)/i)?.[0] || "МООП РЗ РФ";
    return `${orgName} председатель`;
  }
  
  return null;
}

/**
 * Выполняет веб-поиск через внешний API
 * Поддерживает Google Custom Search API, Bing Search API, или Tavily API
 */
async function performWebSearch(query: string): Promise<string> {
  console.log("[assistant/chat] Web search query:", query);
  
  // Проверяем наличие API ключей для веб-поиска
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
  const bingApiKey = process.env.BING_SEARCH_API_KEY;
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  
  try {
    // Приоритет 1: Google Custom Search API
    if (googleApiKey && googleCx) {
      const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${encodeURIComponent(query)}&num=3`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const items = data.items || [];
        if (items.length > 0) {
          const results = items.map((item: any, index: number) => 
            `[Результат ${index + 1}]\nЗаголовок: ${item.title}\nСсылка: ${item.link}\nОписание: ${item.snippet || "Нет описания"}`
          ).join("\n\n");
          return results;
        }
      }
    }
    
    // Приоритет 2: Tavily API (специально для AI)
    if (tavilyApiKey) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: query,
          search_depth: "basic",
          max_results: 3,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        if (results.length > 0) {
          return results.map((item: any, index: number) => 
            `[Результат ${index + 1}]\nЗаголовок: ${item.title}\nСсылка: ${item.url}\nОписание: ${item.content || item.snippet || "Нет описания"}`
          ).join("\n\n");
        }
      }
    }
    
    // Приоритет 3: Bing Search API
    if (bingApiKey) {
      const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=3`;
      const response = await fetch(url, {
        headers: {
          "Ocp-Apim-Subscription-Key": bingApiKey,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const webPages = data.webPages?.value || [];
        if (webPages.length > 0) {
          return webPages.map((item: any, index: number) => 
            `[Результат ${index + 1}]\nЗаголовок: ${item.name}\nСсылка: ${item.url}\nОписание: ${item.snippet || "Нет описания"}`
          ).join("\n\n");
        }
      }
    }
    
    // Если нет настроенных API, возвращаем пустую строку
    console.log("[assistant/chat] No web search API configured");
    return "";
  } catch (error) {
    console.error("[assistant/chat] Web search error:", error);
    return "";
  }
}

function buildSystemPromptWithEnhancedSearch(user: any, formattedSearchInfo: string): string {
  const userName = user.firstName || user.email?.split("@")[0] || "друг";
  const userOrg = user.organization?.name || "не указана";

  let prompt = `Ты умный и дружелюбный AI-ассистент платформы MyUnion. Ты можешь помочь с любыми вопросами.

Пользователь: ${userName}
Его организация: ${userOrg}

У тебя есть доступ к базе данных профсоюзов с информацией о председателях, контактах и организациях.

${formattedSearchInfo ? `### ⚠️ КРИТИЧЕСКИ ВАЖНО - ИСПОЛЬЗУЙ ЭТИ ДАННЫЕ:\n${formattedSearchInfo}\n\n### ИНСТРУКЦИИ:\n- Если выше есть информация о председателе - ОБЯЗАТЕЛЬНО назови его имя и должность\n- НИКОГДА не говори "не знаю" или "не имею информации", если данные есть выше\n- Если пользователь спрашивает про "наш председатель" или "у нас председатель" - используй данные для организации "${userOrg}"\n- Отвечай прямо, используя конкретные факты из данных выше` : "Дополнительная информация не найдена"}

### ВОЗМОЖНОСТИ ПЛАТФОРМЫ MYUNION:
- /dashboard - Главная: новости, скидки, обновления
- /dashboard/documents - Документы: заявления, справки
- /dashboard/news - Новости профсоюза
- /dashboard/discounts - Скидки от партнёров (10-50%)
- /dashboard/profile - Личный профиль
- /dashboard/chat - Чат с коллегами

### ПРАВИЛА:
- КРИТИЧЕСКИ ВАЖНО: Если в данных выше есть ответ на вопрос - ОБЯЗАТЕЛЬНО используй эту информацию
- Если спрашивают о председателе и данные есть - НЕМЕДЛЕННО назови имя и должность
- Можешь отвечать на любые вопросы, не только о профсоюзах
- Будь полезным и дружелюбным
- Только если информации НЕТ НИГДЕ - тогда честно скажи
- НЕ генерируй документы, заявления
- НЕ упоминай технических провайдеров (OpenRouter, OpenAI и т.д.)
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

