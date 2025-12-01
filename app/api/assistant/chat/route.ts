import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retrieveRelevantChunks } from "@/lib/vector-search";
// DefaultBot импортируется динамически из prisma

/**
 * Простой чат-бот помощник для всех страниц
 * Не генерирует документы, не создает сессии
 * Просто отвечает на вопросы о системе
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { message, conversationHistory = [] } = await request.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Сообщение не может быть пустым" },
        { status: 400 }
      );
    }

    // Получаем пользователя с профилем
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

    // Получаем бота по умолчанию
    const bot = await prisma.defaultBot.findFirst({
      where: { isActive: true },
      include: {
        apiProvider: true,
      },
    });

    if (!bot) {
      return NextResponse.json(
        { error: "Бот не настроен" },
        { status: 500 }
      );
    }

    // Поиск релевантных чанков из базы знаний
    const chunks = await retrieveRelevantChunks(message, bot.id, 5);

    // Строим системный промпт
    const systemPrompt = buildSystemPrompt(user, chunks);

    // Формируем историю сообщений для контекста
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Последние 10 сообщений для контекста
      { role: "user", content: message },
    ];

    // Отправляем запрос к AI
    const aiResponse = await callAI(bot, messages);

    return NextResponse.json({
      message: aiResponse,
      id: `msg-${Date.now()}`,
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
- Свежие скидки из BestBenefits

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
- Скидки 10-50% в ресторанах, магазинах, онлайн-сервисах
- Фильтр по городу
- Категории: Еда, Товары, Услуги, Красота, Развлечения
- Активация промокодов

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
- Не придумывай функции, которых нет`;

  return prompt;
}

async function callAI(bot: DefaultBot & { apiProvider: any }, messages: any[]): Promise<string> {
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

