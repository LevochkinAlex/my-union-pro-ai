import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { saveChatConversationToKnowledgeBase } from "@/lib/chat-knowledge-learning";
import { saveUserInteractionToKnowledgeBase } from "@/lib/user-knowledge-base";
import { enhancedSearch, formatSearchResultsForPrompt } from "@/lib/chat-enhanced-search";
import { getOrCreatePrivateChat } from "@/lib/chat-service";
import { isDemoUserId, DEMO_NEWS_ORG_NAME } from "@/lib/demo";
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

    const body = await request.json();
    const message = body?.message;
    const history: Array<{ role: string; content: string }> = Array.isArray(body?.history) ? body.history : [];
    console.log("[assistant/chat] Message received:", message?.substring(0, 50));

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Сообщение не может быть пустым" },
        { status: 400 }
      );
    }

    // Демо-режим: ИИ отвечает, но без записи в БД; история передаётся с клиента (localStorage)
    if (isDemoUserId(session.user.id)) {
      const bot = await prisma.chatBot.findFirst({
        where: { isActive: true },
        include: { apiProvider: true },
      });
      if (!bot) {
        return NextResponse.json(
          { error: "Бот не настроен. Обратитесь к администратору." },
          { status: 500 }
        );
      }
      const apiKey = bot.apiProvider?.apiKey || process.env.OPENROUTER_API_KEY || "";
      if (!apiKey) {
        return NextResponse.json(
          { error: "API ключ не настроен. Обратитесь к администратору." },
          { status: 500 }
        );
      }
      const fakeUser = {
        firstName: "Председатель",
        lastName: "(демо)",
        organization: { name: DEMO_NEWS_ORG_NAME },
      };
      const formattedSearchInfo = "";
      const systemPrompt = buildSystemPromptWithEnhancedSearch(fakeUser, formattedSearchInfo);
      const conversationSlice = history.slice(-10);
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...conversationSlice.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message.trim() },
      ];
      let aiResponse: string;
      try {
        aiResponse = await callAI(bot, messages);
        if (!aiResponse?.trim()) aiResponse = "Извините, не удалось получить ответ. Попробуйте позже.";
      } catch (e: any) {
        aiResponse = e?.message?.includes("401") ? "Ошибка авторизации API." : "Ошибка при обращении к ИИ. Попробуйте позже.";
      }
      return NextResponse.json({ message: aiResponse });
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
      console.error("[assistant/chat] ❌ No active bot found in database!");
      console.error("[assistant/chat] Check: SELECT * FROM ChatBot WHERE isActive = true");
      return NextResponse.json(
        { error: "Бот не настроен. Обратитесь к администратору." },
        { status: 500 }
      );
    }
    
    console.log("[assistant/chat] ✅ Bot found:", {
      id: bot.id,
      name: bot.name,
      model: bot.model,
      hasApiProvider: !!bot.apiProvider,
      apiProviderName: bot.apiProvider?.name || 'none',
      hasApiKey: !!(bot.apiProvider?.apiKey || process.env.OPENROUTER_API_KEY),
    });
    
    // Проверяем наличие API ключа
    const apiKey = bot.apiProvider?.apiKey || process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) {
      console.error("[assistant/chat] ❌ No API key configured!");
      console.error("[assistant/chat] Bot apiProvider:", bot.apiProvider?.name);
      console.error("[assistant/chat] OPENROUTER_API_KEY env:", process.env.OPENROUTER_API_KEY ? "set" : "NOT SET");
      return NextResponse.json(
        { error: "API ключ не настроен. Обратитесь к администратору." },
        { status: 500 }
      );
    }

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
    const { chat } = await getOrCreatePrivateChat(userId, botUser.id);

    // Загружаем историю сообщений из БД для контекста
    const chatHistory = await prisma.chatMessage.findMany({
      where: { chatId: chat.id },
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        senderId: true,
        content: true,
        createdAt: true,
      },
    });

    // Преобразуем историю в формат для AI
    const conversationHistory = chatHistory.reverse().map((msg) => ({
      role: msg.senderId === botUser.id ? "assistant" : "user",
      content: msg.content,
    }));

    // Сохраняем сообщение пользователя в БД
    const userMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: userId,
        content: message.trim(),
        messageType: "text",
      },
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

    // Обновляем последнее сообщение в чате
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessageId: userMessage.id,
        lastMessageAt: userMessage.createdAt,
      },
    });

    // Формируем историю сообщений для контекста (обновляем с учетом сохраненного сообщения)
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Последние 10 сообщений для контекста
      { role: "user", content: message },
    ];

    // Отправляем запрос к AI с обновленной историей
    console.log("[assistant/chat] ========== CALLING AI ==========");
    console.log("[assistant/chat] Messages count:", messages.length);
    console.log("[assistant/chat] Bot model:", bot.model);
    console.log("[assistant/chat] API provider:", bot.apiProvider?.name || "openrouter");
    
    let aiResponse;
    try {
      aiResponse = await callAI(bot, messages);
      console.log("[assistant/chat] ✅ AI response received, length:", aiResponse?.length);
      if (!aiResponse || aiResponse.trim().length === 0) {
        console.error("[assistant/chat] ❌ AI returned empty response!");
        aiResponse = "Извините, не удалось получить ответ от ИИ. Попробуйте позже.";
      }
    } catch (aiError: any) {
      console.error("[assistant/chat] ❌ Error calling AI:", {
        message: aiError?.message,
        stack: aiError?.stack?.substring(0, 500),
        name: aiError?.name,
        code: aiError?.code,
      });
      
      // Возвращаем понятное сообщение об ошибке
      const errorMessage = aiError?.message?.includes("401") || aiError?.message?.includes("Unauthorized")
        ? "Ошибка авторизации API. Проверьте API ключ."
        : aiError?.message?.includes("429") || aiError?.message?.includes("rate limit")
        ? "Превышен лимит запросов. Попробуйте позже."
        : aiError?.message?.includes("timeout")
        ? "Превышено время ожидания ответа. Попробуйте позже."
        : "Ошибка при обращении к ИИ. Попробуйте позже.";
      
      throw new Error(errorMessage);
    }

    // Сохраняем ответ бота в БД
    const botMessage = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderId: botUser.id,
        content: aiResponse,
        messageType: "text",
      },
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

    // Обновляем последнее сообщение в чате
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessageId: botMessage.id,
        lastMessageAt: botMessage.createdAt,
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

    // Отправляем уведомления через WebSocket (если нужно)
    // WebSocket сервер автоматически получит новые сообщения через базу данных

    return NextResponse.json({
      message: aiResponse,
      id: botMessage.id,
      chatId: chat.id,
      userMessage: {
        id: userMessage.id,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      botMessage: {
        id: botMessage.id,
        content: botMessage.content,
        createdAt: botMessage.createdAt,
      },
    });
  } catch (error: any) {
    console.error("[assistant/chat] ❌ ========== FATAL ERROR ==========");
    console.error("[assistant/chat] Error type:", error?.name);
    console.error("[assistant/chat] Error message:", error?.message);
    console.error("[assistant/chat] Error stack:", error?.stack?.substring(0, 1000));
    
    const errorMessage = error?.message || "Ошибка при обработке запроса";
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error?.stack : undefined,
      },
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
- /dashboard/appeals - Обращения к председателю
- /dashboard/appeals/new - Создать новое обращение

### ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ:

**Зачем нужен профсоюз?**
Профсоюз — это объединение работников, которое защищает их права и интересы. Основные преимущества членства:
• Защита трудовых прав и интересов в спорах с работодателем
• Бесплатная юридическая консультация по трудовым вопросам
• Скидки от партнёров профсоюза (до 50%) на товары и услуги
• Материальная помощь в сложных жизненных ситуациях
• Участие в культурных и спортивных мероприятиях
• Санаторно-курортное лечение по льготным ценам
• Коллективная защита интересов работников

**Как создать обращение к председателю?**
1. Перейдите в раздел "Обращения" (/dashboard/appeals)
2. Нажмите "Создать обращение" или перейдите на /dashboard/appeals/new
3. Выберите тему обращения и опишите суть вопроса
4. Отправьте обращение — председатель получит уведомление
5. Отслеживайте статус в разделе "Мои обращения"
6. После ответа вы сможете продолжить диалог в чате

**Как использовать скидки?**
1. Перейдите в раздел "Скидки" (/dashboard/discounts)
2. Просмотрите доступные предложения от партнёров
3. Выберите интересующую скидку и нажмите "Активировать"
4. Получите промокод или купон для использования
5. Покажите купон в магазине или введите промокод онлайн
6. Ваши активированные скидки доступны в разделе "Мои скидки" (/dashboard/discounts/my)

**Какие документы можно получить?**
• Справка о членстве в профсоюзе
• Заявление о вступлении в профсоюз
• Заявление о выходе из профсоюза
• Справка о выплате взносов
• Другие документы по запросу к председателю

### ПРАВИЛА ФОРМАТИРОВАНИЯ:
- Используй markdown для структурирования ответов
- Используй **жирный текст** для выделения важного
- Используй списки (• или 1. 2. 3.) для перечислений
- Пиши кратко и по существу, но информативно
- Разбивай длинные ответы на абзацы

### ОБЩИЕ ПРАВИЛА:
- КРИТИЧЕСКИ ВАЖНО: Если в данных выше есть ответ на вопрос - ОБЯЗАТЕЛЬНО используй эту информацию
- Если спрашивают о председателе и данные есть - НЕМЕДЛЕННО назови имя и должность
- Можешь отвечать на любые вопросы, не только о профсоюзах
- Будь полезным и дружелюбным
- Только если информации НЕТ НИГДЕ - тогда честно скажи
- НЕ генерируй документы, заявления
- НЕ упоминай технических провайдеров (OpenRouter, OpenAI и т.д.)
- Если спросят про модель или технологию - отвечай общими фразами типа "использую современные AI-технологии"
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

  // Используем более умную модель для качественных ответов
  // Приоритет: настройка бота -> переменная окружения -> умная модель по умолчанию
  const model = bot.model || process.env.DEFAULT_AI_MODEL || "openai/gpt-4o";

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

  console.log(`[callAI] ========== SENDING REQUEST TO ${providerName} ==========`);
  console.log(`[callAI] URL: ${responseUrl}`);
  console.log(`[callAI] Model: ${model}`);
  console.log(`[callAI] Messages count: ${messages.length}`);
  console.log(`[callAI] Has API key: ${!!apiKey}`);

  const response = await fetch(responseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log(`[callAI] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[callAI] ❌ AI API error (${response.status}):`, errorText);
    
    // Пробуем распарсить JSON ошибки
    let errorDetails = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorDetails = JSON.stringify(errorJson, null, 2);
      console.error(`[callAI] Error details:`, errorJson);
    } catch {
      // Не JSON, используем как есть
    }
    
    // Формируем понятное сообщение об ошибке
    let errorMessage = `AI API error: ${response.status}`;
    if (response.status === 401) {
      errorMessage = "Ошибка авторизации API. Проверьте API ключ.";
    } else if (response.status === 429) {
      errorMessage = "Превышен лимит запросов. Попробуйте позже.";
    } else if (response.status === 500 || response.status >= 502) {
      errorMessage = "Сервис ИИ временно недоступен. Попробуйте позже.";
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log(`[callAI] ✅ Response received, keys:`, Object.keys(data));

  let aiResponse: string;
  if (providerName === "anthropic") {
    aiResponse = data.content?.[0]?.text || "";
  } else {
    aiResponse = data.choices?.[0]?.message?.content || "";
  }

  if (!aiResponse || aiResponse.trim().length === 0) {
    console.error(`[callAI] ❌ Empty response from AI!`);
    console.error(`[callAI] Response data:`, JSON.stringify(data, null, 2).substring(0, 500));
    throw new Error("ИИ вернул пустой ответ");
  }

  console.log(`[callAI] ✅ AI response length: ${aiResponse.length}`);
  return aiResponse;
}

