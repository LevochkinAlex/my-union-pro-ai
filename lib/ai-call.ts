import type { ChatBot, ApiProvider } from "@prisma/client";
import { callYandexChat, isYandexConfigured, type OpenAIStyleMessage } from "./yandex-ai";
import { logAIUsage } from "./ai-usage";

export type BotWithProvider = ChatBot & { apiProvider: ApiProvider | null };

/**
 * Контекст вызова — используется для учёта расходов (AIUsageEvent).
 * Все поля опциональны. Если не указано — запись всё равно будет, но без разрезов.
 */
export interface CallAIContext {
  route: string;
  userId?: string | null;
  organizationId?: string | null;
}

/**
 * Единственная точка вызова LLM в платформе.
 *
 * Платформа работает из РФ — используем Yandex Foundation Models. Исторически
 * поддерживались OpenRouter/OpenAI/Anthropic; эти провайдеры убраны, так как
 * OpenRouter блокируется в РФ, а других транзакционных ИИ мы больше не держим.
 *
 * После успешного/неуспешного вызова пишем событие в AIUsageEvent
 * (fire-and-forget, ошибка логирования не прерывает ответ).
 */
export async function callAI(
  bot: BotWithProvider,
  messages: OpenAIStyleMessage[],
  context?: CallAIContext,
): Promise<string> {
  if (!isYandexConfigured()) {
    throw new Error(
      "Yandex AI не настроен. Задайте YANDEX_AI_STUDIO_API_KEY и YANDEX_CLOUD_FOLDER_ID в окружении.",
    );
  }

  // Допускаем явный apiKey из настроек бота (провайдер в БД) — полезно, если
  // у разных ботов разные лимиты/квоты в Yandex Cloud.
  const apiKeyOverride = bot.apiProvider?.apiKey || undefined;
  const model = bot.model || process.env.YANDEX_DEFAULT_MODEL || "yandexgpt";
  const temperature =
    typeof bot.temperature === "number" && bot.temperature >= 0 ? bot.temperature : 0.7;
  const maxTokens =
    typeof bot.maxTokens === "number" && bot.maxTokens > 0 ? bot.maxTokens : 2000;

  const startedAt = Date.now();
  try {
    const result = await callYandexChat(messages, {
      model,
      temperature,
      maxTokens,
      apiKey: apiKeyOverride,
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      `[callAI] ✅ model=${result.modelVersion ?? model} len=${result.text.length} ${durationMs}ms`,
    );

    void logAIUsage({
      operation: "chat",
      route: context?.route ?? "callAI",
      model,
      inputTokens: Number(result.usage?.inputTextTokens ?? 0),
      outputTokens: Number(result.usage?.completionTokens ?? 0),
      totalTokens: Number(result.usage?.totalTokens ?? 0),
      userId: context?.userId ?? null,
      organizationId: context?.organizationId ?? null,
      botId: bot.id,
      durationMs,
      status: "ok",
    });

    return result.text;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    void logAIUsage({
      operation: "chat",
      route: context?.route ?? "callAI",
      model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      userId: context?.userId ?? null,
      organizationId: context?.organizationId ?? null,
      botId: bot.id,
      durationMs,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function buildAssistantSystemPrompt(
  user: { firstName?: string | null; email?: string | null; organization?: { name?: string | null } | null },
  formattedSearchInfo: string,
): string {
  const userName = user.firstName || user.email?.split("@")[0] || "друг";
  const userOrg = user.organization?.name || "не указана";

  return `Ты умный и дружелюбный AI-ассистент платформы MyUnion. Ты можешь помочь с любыми вопросами.

Пользователь: ${userName}
Его организация: ${userOrg}

У тебя есть доступ к базе данных профсоюзов с информацией о председателях, контактах и организациях.

${
  formattedSearchInfo
    ? `### ⚠️ КРИТИЧЕСКИ ВАЖНО - ИСПОЛЬЗУЙ ЭТИ ДАННЫЕ:
${formattedSearchInfo}

### ИНСТРУКЦИИ:
- Если выше есть информация о председателе - ОБЯЗАТЕЛЬНО назови его имя и должность
- НИКОГДА не говори "не знаю" или "не имею информации", если данные есть выше
- Если пользователь спрашивает про "наш председатель" или "у нас председатель" - используй данные для организации "${userOrg}"
- Отвечай прямо, используя конкретные факты из данных выше`
    : "Дополнительная информация не найдена"
}

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
- НЕ упоминай технических провайдеров (Yandex, OpenAI и т.д.)
- Если спросят про модель или технологию - отвечай общими фразами типа "использую современные AI-технологии"
- НИКОГДА не упоминай название "BestBenefits" - говори только "партнеры" или "партнеры профсоюза"`;
}
