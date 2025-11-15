import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenRouterConfig } from "@/lib/settings";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import { Logger } from "@/lib/logger";
import { generateMembershipApplication, generateContributionsApplication } from "@/lib/documents";
import { extractProfileDataFromMessages, isProfileComplete } from "@/lib/profile-extraction";
import type { Prisma } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { findOrganization } from "@/lib/organization-search";
import { validateAddressWithDaData } from "@/lib/dadata";

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
async function buildSystemPrompt(
  bot: DefaultBot,
  chunks: RetrievedChunk[],
  sessionType?: "STATEMENT" | "APPEAL"
): Promise<string> {
  let prompt = bot.systemPrompt;

  // Добавляем контекст, если есть
  if (bot.context) {
    prompt += `\n\nКонтекст:\n${bot.context}`;
  }

  // Добавляем специфичные инструкции в зависимости от типа сессии
  if (sessionType === "STATEMENT") {
    // Инструкции для чата создания заявления
    prompt += `\n\n## ИНСТРУКЦИИ ПО СОЗДАНИЮ ЗАЯВЛЕНИЯ О ВСТУПЛЕНИИ В ПРОФСОЮЗ:

Ты помощник для вступления в Профсоюз работников здравоохранения РФ. Твоя задача - помочь пользователю заполнить профиль и подготовить необходимые документы.

### ПОСЛЕДОВАТЕЛЬНОСТЬ СБОРА ДАННЫХ:

1. **РЕГИОН**: Сначала спроси: "Укажите регион России, в которой вы находитесь."
   - Запиши регион в профиль пользователя

2. **ОРГАНИЗАЦИЯ**: Затем спроси: "Теперь укажите наименование организации, в которой вы работаете."
   - Пользователь может написать регион и название организации
   - После получения ответа пользователя система автоматически найдет корректное название организации в базе данных МойСоюз или в реестре Минюста РФ
   - Если система нашла организацию, она покажет тебе найденное название в формате: "[НАЙДЕНА ОРГАНИЗАЦИЯ: полное название организации]"
   - Ты ДОЛЖЕН показать пользователю найденное название и спросить: "Я нашел вашу организацию: [название]. Это правильная организация? (да/нет)"
   - Если пользователь подтвердит (да/да, правильно/верно), используй это название и переходи к следующему шагу
   - Если пользователь откажется (нет/неправильно), попроси указать более точное название или уточнить детали
   - Если организация найдена в базе МойСоюз, используй её точное название
   - Если организация найдена в реестре Минюста, но не в базе МойСоюз, скажи: "Я нашел вашу организацию в реестре: [название]. К сожалению, она пока не участвует в проекте МойСоюз, но мы создадим вам заявление, и если организация добавится в будущем, то оно обязательно дойдет до адресата."
   - Если организация не найдена нигде, попроси уточнить название или проверить правильность написания
   - ВСЕГДА создавай заявление, даже если организации нет в базе
   - Название ППО обычно пересекается с названием организации
   - Сохрани подтвержденное название организации в профиле пользователя

3. **ФИО**: Спроси: "Здорово! Пожалуйста, укажите вашу фамилию, имя и отчество."
   - Извлеки фамилию, имя, отчество

4. **ДАТА РОЖДЕНИЯ**: Спроси: "Теперь, пожалуйста, укажите вашу дату рождения в формате ДД.ММ.ГГГГ."
   - Пользователь может указать дату в любом формате:
     * ДД.ММ.ГГГГ (12.02.1970)
     * ДД/ММ/ГГГГ (12/02/1970)
     * Естественный формат (12 февраля 1970, 12 фев 1970)
   - Распознавай все эти форматы и парси их правильно

5. **АДРЕС**: Спроси: "Теперь, пожалуйста, укажите ваш полный адрес проживания."
   - Попроси полный адрес с указанием:
     * Города или населенного пункта
     * Улицы, проспекта, бульвара
     * Номера дома
     * Номера квартиры/офиса (если применимо)
   - Адрес будет автоматически валидирован и стандартизирован
   - После валидации адреса скажи: "Отлично! Ваш адрес сохранен: [адрес]. Теперь, пожалуйста, укажите ваш номер телефона."

6. **ТЕЛЕФОН**: Спроси: "Теперь, пожалуйста, укажите ваш номер телефона."
   - Ожидаются российские номера в формате +7 или 8 с 10 цифрами

7. **ДОЛЖНОСТЬ**: Спроси: "Теперь укажите, пожалуйста, вашу занимаемую должность на работе."
   - Запиши должность

8. **ПРОФЕССИЯ**: Если не указана, спроси профессию

9. **ОБРАЗОВАНИЕ**: Если не указано, спроси образование

### ПОСЛЕ ЗАПОЛНЕНИЯ ВСЕХ ДАННЫХ:

Когда все данные собраны, скажи:
"Отлично! Все данные собраны. Теперь я сгенерирую для вас заявление о вступлении в профсоюз. После этого вы сможете его скачать, распечатать, подписать и загрузить обратно сюда для проверки."

После генерации документов скажи:
"Скачайте и проверьте данные в заявлении. Ознакомьтесь с уставом (Устав доступен в разделе Документы). После проверки распечатайте заявление, подпишите его и загрузите обратно сюда для проверки правильности заполнения."

Когда пользователь загрузит подписанное заявление (сообщение содержит "загрузил файл" или "загружен файл"):
- НЕ показывай данные профиля для подтверждения
- НЕ проси подтвердить данные
- Скажи: "Спасибо! Я получил ваше подписанное заявление. Проверяю его правильность заполнения..."
- Затем проверь (на основе информации о документе):
  * Что документ загружен и сохранен
  * Что это правильный тип документа (заявление о вступлении или о взносах)
- После проверки скажи: "Заявление получено и проверено. Оно отправлено в Профсоюз. Для полного доступа к системе Вам необходимо подписанные оригиналы принести в Профком."
- НЕ задавай дополнительные вопросы о данных профиля после загрузки документа

### ВАЖНО:
- Парси естественный язык пользователя и не требуй строгих форматов
- НЕ предлагай создавать обращения - для этого есть отдельный чат
- Всегда создавай заявление, даже если организации нет в базе
- Будь вежливым и профессиональным`;
  } else if (sessionType === "APPEAL") {
    // Инструкции для чата обращений
    prompt += `\n\n## ИНСТРУКЦИИ ДЛЯ РАБОТЫ С ОБРАЩЕНИЯМИ:

Ты помогаешь пользователю с его обращением в профсоюз. Пользователь УЖЕ является членом профсоюза или обращается с конкретным вопросом/проблемой.

Твоя задача:
- Выслушать и понять проблему или вопрос пользователя
- Предоставить полезную информацию на основе базы знаний профсоюза
- Помочь решить вопрос пользователя или направить его к правильному решению
- Быть вежливым и профессиональным

СТРОГО ЗАПРЕЩЕНО:
- НЕ предлагай пользователю вступить в профсоюз - для этого есть отдельный чат "Заявление"
- НЕ предлагай создать заявление о вступлении - пользователь уже может быть членом
- НЕ проси заполнять профиль - это делается в отдельном чате "Заявление"
- НЕ переключайся на тему вступления в профсоюз

ФОКУС:
- Только на решении конкретного обращения пользователя
- На предоставлении информации по его вопросу
- На помощи с проблемами, связанными с профсоюзом`;
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
  let session: any = null;
  let message: string = "";
  
  try {
    session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const body = await request.json();
    message = body.message;
    const chatBotId = body.chatBotId;
    const sessionId = body.sessionId; // ID сессии чата

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Сообщение обязательно" },
        { status: 400 }
      );
    }

    // Получаем или создаем сессию чата
    let chatSession = null;
    if (sessionId) {
      // Проверяем, что сессия существует и принадлежит пользователю
      chatSession = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId: session.user.id,
        },
      });
      
      if (!chatSession) {
        return NextResponse.json(
          { error: "Сессия не найдена" },
          { status: 404 }
        );
      }
    } else {
      // Создаем новую сессию для заявления (по умолчанию)
      chatSession = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          title: "Заявление",
          type: "STATEMENT",
        },
      });
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

    // Если в сообщении пользователя есть адрес, валидируем его через Dadata ДО отправки к AI
    let validatedAddress: string | null = null;
    let userMessage = message;
    if (message && (message.toLowerCase().includes("адрес") || message.toLowerCase().includes("живу") || message.toLowerCase().includes("проживаю"))) {
      try {
        console.log("[chat] Pre-validating address via Dadata:", message);
        validatedAddress = await validateAddressWithDaData(message);
        if (validatedAddress) {
          console.log("[chat] Address pre-validated via Dadata:", validatedAddress);
          // Сохраняем валидированный адрес в профиль сразу (без добавления метки в сообщение)
          await prisma.user.update({
            where: { id: session.user.id },
            data: { address: validatedAddress },
          });
        }
      } catch (dadataError) {
        console.warn("[chat] Error pre-validating address with Dadata:", dadataError);
      }
    }

    // Если в сообщении пользователя есть название организации, ищем её ДО отправки к AI
    let foundOrganization: { name: string; foundInDatabase: boolean; id?: string } | null = null;
    if (chatSession.type === "STATEMENT" && message && (message.toLowerCase().includes("организац") || message.toLowerCase().includes("работаю") || message.toLowerCase().includes("работа"))) {
      try {
        // Получаем регион пользователя для более точного поиска
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { region: true },
        });
        
        console.log("[chat] Searching organization before AI:", message);
        foundOrganization = await findOrganization(message, user?.region || undefined);
        
        if (foundOrganization) {
          console.log("[chat] Organization found:", foundOrganization.name, "in DB:", foundOrganization.foundInDatabase);
          // Добавляем метку в сообщение для AI, чтобы он мог показать найденную организацию пользователю
          userMessage = `${message}\n\n[НАЙДЕНА ОРГАНИЗАЦИЯ: ${foundOrganization.name}${foundOrganization.foundInDatabase ? " (в базе МойСоюз)" : " (в реестре Минюста РФ)"}]`;
        } else {
          console.log("[chat] Organization not found");
        }
      } catch (orgError) {
        console.warn("[chat] Error searching organization before AI:", orgError);
      }
    }

    // Формируем системный промпт с учетом настроек бота и типа сессии
    const systemPrompt = await buildSystemPrompt(bot, relevantChunks, chatSession.type);

    // Получаем историю сообщений из текущей сессии
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        sessionId: chatSession.id,
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 50, // Последние 50 сообщений
    });

    // Проверяем, был ли недавно загружен документ (в последних сообщениях пользователя)
    let uploadedDocument: { type: string; fileName: string; documentId: string } | null = null;
    if (message && (message.toLowerCase().includes("загрузил файл") || message.toLowerCase().includes("загружен файл"))) {
      // Ищем последний загруженный документ пользователя
      const recentDocuments = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000), // За последние 5 минут
          },
          status: "SIGNED", // Подписанные документы
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      });

      if (recentDocuments.length > 0) {
        const doc = recentDocuments[0];
        uploadedDocument = {
          type: doc.type,
          fileName: doc.fileName || doc.title,
          documentId: doc.id,
        };
        console.log("[chat] Found uploaded document:", uploadedDocument);
      }
    }

    // Добавляем информацию о загруженном документе в системный промпт, если он есть
    let enhancedSystemPrompt = systemPrompt;
    if (uploadedDocument) {
      enhancedSystemPrompt += `\n\n[ВАЖНО: Пользователь только что загрузил документ]
Тип документа: ${uploadedDocument.type}
Имя файла: ${uploadedDocument.fileName}
ID документа: ${uploadedDocument.documentId}

Это подписанное заявление, которое пользователь загрузил для проверки. Ты должен:
1. Подтвердить получение документа
2. Сообщить, что документ проверен
3. Напомнить о необходимости принести оригиналы в Профком
НЕ проси подтверждать данные профиля - документ уже загружен и проверяется.`;
    }

    // Формируем массив сообщений для OpenRouter
    const messages: ChatMessagePayload[] = [
      {
        role: "system",
        content: enhancedSystemPrompt,
      },
      ...chatHistory.map((msg) => ({
        role: msg.role as ChatMessagePayload["role"],
        content: msg.content,
      })),
      {
        role: "user",
        content: userMessage,
      },
    ];

    // Сохраняем сообщение пользователя с привязкой к сессии
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        sessionId: chatSession.id,
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
    // Только для STATEMENT сессий
    if (chatSession.type === "STATEMENT") {
      try {
        const allMessages = await prisma.chatMessage.findMany({
          where: { 
            userId: session.user.id,
            sessionId: chatSession.id,
          },
          orderBy: { createdAt: "asc" },
        });

        // Проверяем, есть ли уже маркер
        const hasCompleteMarker = allMessages.some(
          msg => msg.role === "assistant" && msg.content.includes("[PROFILE_COMPLETE]")
        );

        // Всегда пытаемся извлечь и обновить данные из чата (даже если маркер есть, чтобы обновить данные)
        console.log("[chat] Extracting profile data from messages...");
        
        try {
          // Пытаемся извлечь данные из сообщений чата (включая новое сообщение)
          const messagesForExtraction = [
            ...allMessages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            {
              role: "user" as const,
              content: message,
            },
            {
              role: "assistant" as const,
              content: aiResponse,
            },
          ];
          
          // Функция извлечения
          const extractedData = await extractProfileDataFromMessages(messagesForExtraction);
          
          console.log("[chat] Extracted data:", extractedData);
          
          // Если в сообщении пользователя есть адрес, валидируем его через Dadata
          if (message && (message.toLowerCase().includes("адрес") || message.toLowerCase().includes("живу") || message.toLowerCase().includes("проживаю") || extractedData.address)) {
            const addressToValidate = extractedData.address || message;
            if (addressToValidate && addressToValidate.length > 5) {
              try {
                console.log("[chat] Validating address via Dadata:", addressToValidate);
                const validatedAddress = await validateAddressWithDaData(addressToValidate);
                if (validatedAddress) {
                  extractedData.address = validatedAddress;
                  console.log("[chat] Address validated via Dadata:", validatedAddress);
                  // Обновляем адрес в профиле сразу
                  await prisma.user.update({
                    where: { id: session.user.id },
                    data: { address: validatedAddress },
                  });
                } else {
                  console.log("[chat] Address could not be validated via Dadata, using original");
                }
              } catch (dadataError) {
                console.warn("[chat] Error validating address with Dadata:", dadataError);
              }
            }
          }
          
          // Если организация уже была найдена до отправки к AI, используем её
          if (foundOrganization) {
            if (foundOrganization.foundInDatabase && foundOrganization.id) {
              // Организация найдена в базе - привязываем к пользователю
              extractedData.organizationId = foundOrganization.id;
              console.log("[chat] Using organization found before AI (in database):", foundOrganization.name);
            } else {
              // Организация найдена в Минюсте, но не в базе - сохраняем название
              extractedData.organizationName = foundOrganization.name;
              console.log("[chat] Using organization found before AI (in Minjust):", foundOrganization.name);
            }
          } else if (extractedData.organizationName || message.includes("организац") || message.includes("работаю")) {
            // Если организация не была найдена до AI, пытаемся найти её сейчас
            const orgName = extractedData.organizationName || message;
            const userRegion = extractedData.region;
            
            try {
              const foundOrg = await findOrganization(orgName, userRegion);
              if (foundOrg?.foundInDatabase && foundOrg.id) {
                // Организация найдена в базе - привязываем к пользователю
                extractedData.organizationId = foundOrg.id;
                console.log("[chat] Organization found in database:", foundOrg.name);
              } else if (foundOrg?.name) {
                // Организация найдена в Минюсте, но не в базе - сохраняем название
                extractedData.organizationName = foundOrg.name;
                console.log("[chat] Organization found in Minjust:", foundOrg.name);
              }
            } catch (orgError) {
              console.warn("[chat] Error searching organization:", orgError);
            }
          }
          
          // Обновляем профиль с извлеченными данными (даже если данные уже есть, перезаписываем)
          if (Object.keys(extractedData).length > 0) {
            // Убираем пустые значения и organizationName (это не поле в User)
            const cleanData = Object.fromEntries(
              Object.entries(extractedData).filter(
                ([key, value]) =>
                  key !== "organizationName" && // organizationName не сохраняем напрямую
                  value !== undefined &&
                  value !== null &&
                  value !== "" &&
                  !(typeof value === "number" && Number.isNaN(value))
              )
            );
            
            if (Object.keys(cleanData).length > 0) {
              await prisma.user.update({
                where: { id: session.user.id },
                data: cleanData,
              });
              console.log("[chat] Profile updated with extracted data:", cleanData);
            }
          }
        } catch (extractError) {
          console.warn("[chat] Error extracting data:", extractError);
        }

        // Теперь проверяем полноту профиля
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
        });

        // Проверяем, заполнены ли все необходимые поля профиля
        const profileIsComplete = isProfileComplete(user);

        console.log("[chat] Profile completeness check:", {
          firstName: !!user?.firstName,
          lastName: !!user?.lastName,
          dateOfBirth: !!user?.dateOfBirth,
          phone: !!user?.phone,
          address: !!user?.address,
          jobTitle: !!user?.jobTitle,
          profession: !!user?.profession,
          education: !!user?.education,
          isComplete: profileIsComplete,
        });

        // Добавляем маркер только если его еще нет и профиль заполнен
        if (!hasCompleteMarker && profileIsComplete) {
          console.log("[chat] ✅ Profile is COMPLETE! Adding [PROFILE_COMPLETE] marker");
          aiResponse += "\n\n[PROFILE_COMPLETE]";
          
          // Генерируем документы
          try {
            console.log("[chat] 📄 Generating documents...");
            const userOrg = await prisma.user.findUnique({
              where: { id: session.user.id },
              include: { organization: true },
            });
            
            if (userOrg) {
              // Генерируем PDF файлы
              const [membershipPath, contributionsPath] = await Promise.all([
                generateMembershipApplication(userOrg),
                generateContributionsApplication(userOrg, userOrg.organization?.name, undefined),
              ]);
              
              console.log("[chat] PDF files generated:", { membershipPath, contributionsPath });
              
              // Проверяем существующие документы
              const existingDocs = await prisma.document.findMany({
                where: {
                  userId: session.user.id,
                  type: {
                    in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
                  },
                },
              });

              // Получаем размеры файлов
              const fs = await import("fs/promises");
              const pathModule = await import("path");
              
              const membershipStats = await fs.stat(pathModule.join(process.cwd(), "public", membershipPath));
              const contributionsStats = await fs.stat(pathModule.join(process.cwd(), "public", contributionsPath));

              // Создаем или обновляем документы в базе данных
              const ppoChairman = userOrg.organization?.chairmanName || "Председатель ППО";
              
              // Заявление о вступлении
              const existingMembership = existingDocs.find(d => d.type === "MEMBERSHIP_APPLICATION");
              if (existingMembership) {
                await prisma.document.update({
                  where: { id: existingMembership.id },
                  data: {
                    filePath: membershipPath,
                    fileName: pathModule.basename(membershipPath),
                    fileSize: membershipStats.size,
                    status: "GENERATED",
                  },
                });
                console.log("[chat] ✅ Membership application updated in DB");
              } else {
                await prisma.document.create({
                  data: {
                    userId: session.user.id,
                    type: "MEMBERSHIP_APPLICATION",
                    status: "GENERATED",
                    title: "Заявление о вступлении в профсоюз",
                    filePath: membershipPath,
                    fileName: pathModule.basename(membershipPath),
                    fileSize: membershipStats.size,
                    mimeType: "application/pdf",
                    organizationId: userOrg.organizationId || null,
                  },
                });
                console.log("[chat] ✅ Membership application created in DB");
              }

              // Заявление о взносах
              const existingContributions = existingDocs.find(d => d.type === "CONTRIBUTION_APPLICATION");
              if (existingContributions) {
                await prisma.document.update({
                  where: { id: existingContributions.id },
                  data: {
                    filePath: contributionsPath,
                    fileName: pathModule.basename(contributionsPath),
                    fileSize: contributionsStats.size,
                    status: "GENERATED",
                  },
                });
                console.log("[chat] ✅ Contributions application updated in DB");
              } else {
                await prisma.document.create({
                  data: {
                    userId: session.user.id,
                    type: "CONTRIBUTION_APPLICATION",
                    status: "GENERATED",
                    title: "Заявление о взносах",
                    filePath: contributionsPath,
                    fileName: pathModule.basename(contributionsPath),
                    fileSize: contributionsStats.size,
                    mimeType: "application/pdf",
                    organizationId: userOrg.organizationId || null,
                  },
                });
                console.log("[chat] ✅ Contributions application created in DB");
              }
              
              console.log("[chat] ✅ Documents generated and saved to database successfully");
            }
          } catch (docError) {
            console.error("[chat] ⚠️  Error generating documents:", docError);
            // Don't fail the response if document generation fails
          }
        } else if (!profileIsComplete) {
          console.log("[chat] ❌ Profile still incomplete after extraction");
        } else {
          console.log("[chat] Profile complete marker already exists");
        }
      } catch (error) {
        console.error("[chat] Error checking profile completeness:", error);
        // Don't fail the chat if profile check fails
      }
    }

    // Сохраняем ответ AI с привязкой к сессии
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        sessionId: chatSession.id,
        role: "assistant",
        content: aiResponse,
        chatBotId: bot.id,
      },
    });

    // Send push notification to user with action buttons (only if user is not actively chatting)
    try {
      const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
      const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
      
      if (ONESIGNAL_API_KEY && ONESIGNAL_APP_ID) {
        // Get user's OneSignal subscriptions
        const userSubs = await prisma.pushSubscription.findMany({
          where: { userId: session.user.id },
          select: { oneSignalId: true },
        });

        console.log("[chat] Checking push subscriptions:", {
          userId: session.user.id,
          subscriptionsCount: userSubs.length,
          subscriptions: userSubs.map(s => s.oneSignalId),
        });

        if (userSubs.length > 0) {
          // Проверяем настройки пользователя для push уведомлений
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
              pushNotificationsEnabled: true,
              pushSoundEnabled: true,
            },
          });

          console.log("[chat] User push settings:", {
            pushNotificationsEnabled: user?.pushNotificationsEnabled,
            pushSoundEnabled: user?.pushSoundEnabled,
          });

          // Если push уведомления отключены, не отправляем
          if (user && user.pushNotificationsEnabled === false) {
            console.log("[chat] ⚠️ Push notifications disabled for user");
          } else {
            const recipientIds = userSubs.map((sub) => sub.oneSignalId);
            const ONESIGNAL_API_URL = "https://onesignal.com/api/v1/notifications";
            
            const notificationPayload: Record<string, any> = {
              app_id: ONESIGNAL_APP_ID,
              include_player_ids: recipientIds,
              headings: { 
                en: bot.name || "AI Assistant", 
                ru: bot.name || "AI Помощник" 
              },
              contents: { 
                en: aiResponse.substring(0, 150) + (aiResponse.length > 150 ? "..." : ""),
                ru: aiResponse.substring(0, 150) + (aiResponse.length > 150 ? "..." : ""),
              },
              // Параметры для веб-уведомлений
              url: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/dashboard?session=${chatSession.id}`,
              web_buttons: [
                {
                  id: "id1",
                  text: "Открыть",
                  url: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/dashboard?session=${chatSession.id}`,
                }
              ],
              data: {
                type: "chat_message",
                chatBotId: bot.id,
                sessionId: chatSession.id,
              },
              priority: 10,
              ttl: 86400,
              // ВАЖНО: звук должен быть явно указан
              chrome_web_icon: `${process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro"}/logo.png`,
            };

            // Добавляем звук для уведомлений
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
            
            if (user?.pushSoundEnabled !== false) {
              // Базовый звук для мобильных приложений
              notificationPayload.sound = "default";
              
              // Для веб-уведомлений используем URL к звуковому файлу
              // Chrome и Firefox поддерживают звук через URL
              notificationPayload.chrome_web_sound = `${baseUrl}/notification-sound.mp3`;
              notificationPayload.firefox_sound = `${baseUrl}/notification-sound.mp3`;
              // Safari использует default
              notificationPayload.safari_sound = "default";
              
              // Также добавляем в data для Service Worker
              notificationPayload.data = {
                ...notificationPayload.data,
                playSound: true,
                soundUrl: `${baseUrl}/notification-sound.mp3`,
              };
            } else {
              notificationPayload.sound = null;
              notificationPayload.chrome_web_sound = null;
              notificationPayload.firefox_sound = null;
              notificationPayload.safari_sound = null;
            }

            console.log("[chat] 📢 Notification payload:", {
              recipients: recipientIds.length,
              recipientIds: recipientIds.slice(0, 3), // Первые 3 для логов
              sound: notificationPayload.chrome_web_sound,
              chrome_web_sound: notificationPayload.chrome_web_sound,
              firefox_sound: notificationPayload.firefox_sound,
              safari_sound: notificationPayload.safari_sound,
              url: notificationPayload.url,
              fullPayload: JSON.stringify(notificationPayload, null, 2),
            });

            const pushResponse = await fetch(ONESIGNAL_API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                Authorization: `Bearer ${ONESIGNAL_API_KEY}`, // OneSignal v2 API использует Bearer токен
              },
              body: JSON.stringify(notificationPayload),
            });

            if (pushResponse.ok) {
              const result = await pushResponse.json();
              console.log("[chat] ✅ Push notification sent successfully:", {
                notificationId: result.id,
                recipients: recipientIds.length,
                recipientIds: recipientIds,
                soundEnabled: user?.pushSoundEnabled !== false,
                hasSound: !!notificationPayload.sound,
                payload: {
                  app_id: notificationPayload.app_id,
                  include_player_ids: notificationPayload.include_player_ids?.length || 0,
                  sound: notificationPayload.sound,
                },
                oneSignalResponse: result,
              });
              
              // Проверяем есть ли ошибки в ответе OneSignal
              if (result.errors && result.errors.length > 0) {
                console.error("[chat] ⚠️ OneSignal returned errors:", result.errors);
              }
              
              if (result.recipients === 0) {
                console.error("[chat] ⚠️ OneSignal delivered to 0 recipients!");
              }
            } else {
              const errorText = await pushResponse.text();
              const errorStatus = pushResponse.status;
              console.error("[chat] ❌ Push notification failed:", {
                status: errorStatus,
                error: errorText,
                recipientIds: recipientIds,
                recipientIdsFormatted: recipientIds.map(id => ({
                  id,
                  isValidUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
                })),
                appId: ONESIGNAL_APP_ID,
                hasApiKey: !!ONESIGNAL_API_KEY,
              });
            }
          }
        } else {
          console.log("[chat] ℹ️ No push subscriptions found for user");
        }
      } else {
        console.log("[chat] ℹ️ OneSignal not configured, skipping push notification");
      }
    } catch (pushError) {
      console.warn("[chat] ⚠️ Push notification error:", pushError);
      // Don't fail the chat if push fails
    }

    return NextResponse.json({
      message: aiResponse,
      sessionId: chatSession.id,
      sessionType: chatSession.type,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    
    // Log critical error
    await Logger.critical(
      "api/chat/POST",
      errorMessage,
      error,
      {
        userMessage: message?.substring(0, 100),
        sessionExists: !!session,
      },
      session?.user?.id
    );
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : "") : undefined
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
    
    // Ищем последнюю сессию заявления (STATEMENT) или создаем новую
    let chatSession = await prisma.chatSession.findFirst({
      where: {
        userId: session.user.id,
        type: "STATEMENT",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Если нет сессии заявления, создаем новую
    if (!chatSession) {
      console.log("GET /api/chat: Сессии заявления нет, создаем новую...");
      chatSession = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          title: "Заявление",
          type: "STATEMENT",
        },
      });
    }
    
    console.log(`GET /api/chat: Поиск сообщений для сессии ${chatSession.id}...`);
    let messages = await prisma.chatMessage.findMany({
      where: { 
        userId: session.user.id,
        sessionId: chatSession.id,
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`GET /api/chat: Найдено ${messages.length} сообщений в сессии.`);

    // Если в сессии нет сообщений, но есть старые сообщения без sessionId, привязываем их к сессии
    if (messages.length === 0) {
      console.log("GET /api/chat: Сообщений в сессии нет, проверяем старые сообщения без sessionId...");
      const oldMessages = await prisma.chatMessage.findMany({
        where: {
          userId: session.user.id,
          sessionId: null,
        },
        orderBy: { createdAt: "asc" },
        take: 100, // Берем последние 100 сообщений
      });
      
      if (oldMessages.length > 0) {
        console.log(`GET /api/chat: Найдено ${oldMessages.length} старых сообщений без sessionId, привязываем к сессии...`);
        // Привязываем старые сообщения к сессии
        await prisma.chatMessage.updateMany({
          where: {
            id: { in: oldMessages.map(m => m.id) },
          },
          data: {
            sessionId: chatSession.id,
          },
        });
        messages = oldMessages;
        console.log(`GET /api/chat: Привязано ${messages.length} сообщений к сессии.`);
      }
    }

    if (messages.length === 0) {
      console.log("GET /api/chat: Сообщений нет, создаем приветствие.");
      console.log("GET /api/chat: Поиск бота по умолчанию...");
      const defaultBot = await getDefaultBot();
      if (!defaultBot) {
        console.error("GET /api/chat: Критическая ошибка - бот по умолчанию не найден!");
        throw new Error("Бот по умолчанию не сконфигурирован в базе данных.");
      }
      console.log(`GET /api/chat: Бот по умолчанию найден: ${defaultBot.name}`);
      
      // Приветствие зависит от типа сессии
      const welcomeMessageContent = chatSession.type === "APPEAL"
        ? "Здравствуйте! Я ваш помощник по обращениям в профсоюз. Я могу помочь вам с вопросами по различным направлениям: бухгалтерия, юридические вопросы, технические вопросы и другие. Опишите, пожалуйста, ваше обращение или вопрос, и я постараюсь вам помочь."
        : "Здравствуйте! Я ваш помощник для вступления в Профсоюз работников здравоохранения РФ. Я помогу вам заполнить профиль и подготовить необходимые документы для этого. Давайте начнем. Укажите регион России, в которой вы находитесь.";
      
      console.log("GET /api/chat: Создание приветственного сообщения в БД...");
      const welcomeMessage = await prisma.chatMessage.create({
        data: {
          content: welcomeMessageContent,
          role: "assistant",
          userId: session.user.id,
          sessionId: chatSession.id,
          chatBotId: defaultBot.id,
        },
      });
      console.log("GET /api/chat: Приветственное сообщение создано. ID:", welcomeMessage.id);
      return NextResponse.json({ 
        session: {
          id: chatSession.id,
          title: chatSession.title,
          type: chatSession.type,
        },
        messages: [welcomeMessage] 
      });
    }

    console.log("GET /api/chat: Возвращаем историю сообщений.");
    return NextResponse.json({ 
      session: {
        id: chatSession.id,
        title: chatSession.title,
        type: chatSession.type,
      },
      messages 
    });
    
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

