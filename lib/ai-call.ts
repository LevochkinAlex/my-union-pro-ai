import type { ChatBot, ApiProvider } from "@prisma/client";

export type BotWithProvider = ChatBot & { apiProvider: ApiProvider | null };

export async function callAI(
  bot: BotWithProvider,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const providerName = bot.apiProvider?.name || "openrouter";
  const apiKey =
    bot.apiProvider?.apiKey || process.env.OPENROUTER_API_KEY || "";
  const apiBaseUrl =
    bot.apiProvider?.apiBaseUrl ||
    "https://openrouter.ai/api/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (providerName === "openrouter") {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] =
      process.env.NEXTAUTH_URL || "http://localhost:3004";
    headers["X-Title"] = "MyUnion Pro";
  } else if (providerName === "openai") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (providerName === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  const model =
    bot.model || process.env.DEFAULT_AI_MODEL || "openai/gpt-4o";

  let requestBody: any;
  let responseUrl: string;

  if (providerName === "anthropic") {
    responseUrl =
      apiBaseUrl || "https://api.anthropic.com/v1/messages";
    requestBody = {
      model,
      max_tokens: 1024,
      messages: messages.filter((m) => m.role !== "system"),
      system:
        messages.find((m) => m.role === "system")?.content || "",
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

  console.log(
    `[callAI] ========== SENDING REQUEST TO ${providerName} ==========`,
  );
  console.log(`[callAI] URL: ${responseUrl}`);
  console.log(`[callAI] Model: ${model}`);
  console.log(`[callAI] Messages count: ${messages.length}`);
  console.log(`[callAI] Has API key: ${!!apiKey}`);

  const response = await fetch(responseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  console.log(
    `[callAI] Response status: ${response.status} ${response.statusText}`,
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[callAI] ❌ AI API error (${response.status}):`,
      errorText,
    );

    try {
      const errorJson = JSON.parse(errorText);
      console.error(`[callAI] Error details:`, errorJson);
    } catch {
      // not JSON
    }

    let errorMessage = `AI API error: ${response.status}`;
    if (response.status === 401) {
      errorMessage = "Ошибка авторизации API. Проверьте API ключ.";
    } else if (response.status === 429) {
      errorMessage = "Превышен лимит запросов. Попробуйте позже.";
    } else if (response.status === 500 || response.status >= 502) {
      errorMessage =
        "Сервис ИИ временно недоступен. Попробуйте позже.";
    }

    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log(
    `[callAI] ✅ Response received, keys:`,
    Object.keys(data),
  );

  let aiResponse: string;
  if (providerName === "anthropic") {
    aiResponse = data.content?.[0]?.text || "";
  } else {
    aiResponse = data.choices?.[0]?.message?.content || "";
  }

  if (!aiResponse || aiResponse.trim().length === 0) {
    console.error(`[callAI] ❌ Empty response from AI!`);
    console.error(
      `[callAI] Response data:`,
      JSON.stringify(data, null, 2).substring(0, 500),
    );
    throw new Error("ИИ вернул пустой ответ");
  }

  console.log(`[callAI] ✅ AI response length: ${aiResponse.length}`);
  return aiResponse;
}

export function buildAssistantSystemPrompt(
  user: { firstName?: string | null; email?: string | null; organization?: { name?: string | null } | null },
  formattedSearchInfo: string,
): string {
  const userName =
    user.firstName || user.email?.split("@")[0] || "друг";
  const userOrg = user.organization?.name || "не указана";

  return `Ты умный и дружелюбный AI-ассистент платформы MyUnion. Ты можешь помочь с любыми вопросами.

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
}
