/**
 * Клиент Yandex Foundation Models (YandexGPT).
 *
 * Используется как замена OpenRouter/OpenAI, потому что РФ блокирует OpenRouter.
 *
 * Авторизация: Api-Key из YANDEX_AI_STUDIO_API_KEY (создаётся в Yandex Cloud IAM
 * для сервис-аккаунта с ролью `ai.languageModels.user`).
 * Folder ID: YANDEX_CLOUD_FOLDER_ID — берётся folder, которому принадлежит
 * сервис-аккаунт (НЕ ID API-ключа и не ID сервис-аккаунта).
 *
 * Документация: https://yandex.cloud/ru/docs/foundation-models/text-generation/api-ref/TextGeneration/completion
 */

const YANDEX_CHAT_ENDPOINT =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";
const YANDEX_EMBED_ENDPOINT =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding";

export type OpenAIMessageRole = "system" | "user" | "assistant" | string;

export interface OpenAIStyleMessage {
  role: OpenAIMessageRole;
  content: string;
}

interface YandexMessage {
  role: "system" | "user" | "assistant";
  text: string;
}

export interface YandexChatOptions {
  /** Модель: короткое имя (yandexgpt, yandexgpt-lite, yandexgpt-32k, yandexgpt-5) или полный modelUri (gpt://...). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Переопределить API ключ (по умолчанию из YANDEX_AI_STUDIO_API_KEY). */
  apiKey?: string;
  /** Переопределить folder id (по умолчанию из YANDEX_CLOUD_FOLDER_ID). */
  folderId?: string;
}

export interface YandexChatResult {
  text: string;
  modelVersion?: string;
  usage?: {
    inputTextTokens?: string;
    completionTokens?: string;
    totalTokens?: string;
  };
}

/**
 * Таблица маппинга моделей OpenRouter/OpenAI → Yandex.
 * Нужна, чтобы ничего не переписывать в БД (ChatBot.model) при миграции:
 * старые значения автоматически превращаются в актуальные Yandex-модели.
 */
const MODEL_ALIASES: Record<string, string> = {
  // OpenAI через OpenRouter
  "openai/gpt-4o": "yandexgpt",
  "openai/gpt-4o-mini": "yandexgpt-lite",
  "openai/gpt-4-turbo": "yandexgpt",
  "openai/gpt-4": "yandexgpt",
  "openai/gpt-3.5-turbo": "yandexgpt-lite",
  "openrouter/auto": "yandexgpt",
  // OpenAI напрямую
  "gpt-4o": "yandexgpt",
  "gpt-4o-mini": "yandexgpt-lite",
  "gpt-4-turbo": "yandexgpt",
  "gpt-4": "yandexgpt",
  "gpt-3.5-turbo": "yandexgpt-lite",
  // Anthropic (нет прямого аналога, используем флагман)
  "anthropic/claude-3-5-sonnet": "yandexgpt",
  "anthropic/claude-3-5-sonnet-20241022": "yandexgpt",
  "anthropic/claude-3-opus": "yandexgpt",
  "anthropic/claude-3-sonnet": "yandexgpt",
  "anthropic/claude-3-haiku": "yandexgpt-lite",
};

/**
 * Сборка modelUri по короткому имени.
 * Если уже передан полный uri (gpt://...) — вернём как есть.
 */
export function resolveYandexModelUri(model: string, folderId: string): string {
  const trimmed = (model || "").trim();
  if (!trimmed) return `gpt://${folderId}/yandexgpt/latest`;
  if (trimmed.startsWith("gpt://") || trimmed.startsWith("emb://")) {
    return trimmed;
  }
  const alias = MODEL_ALIASES[trimmed] ?? trimmed;
  // Если пользователь передал "yandexgpt-lite" — достроим до /latest
  const hasVersion = alias.includes("/");
  const modelName = hasVersion ? alias : `${alias}/latest`;
  return `gpt://${folderId}/${modelName}`;
}

function openAIToYandexMessages(messages: OpenAIStyleMessage[]): YandexMessage[] {
  return messages.map((m) => {
    const role: YandexMessage["role"] =
      m.role === "system" || m.role === "assistant" ? m.role : "user";
    return { role, text: String(m.content ?? "") };
  });
}

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Единая проверка: настроен ли YandexGPT.
 * Используется в точках выбора провайдера.
 */
export function isYandexConfigured(): boolean {
  return !!readEnv("YANDEX_AI_STUDIO_API_KEY") && !!readEnv("YANDEX_CLOUD_FOLDER_ID");
}

/**
 * Запрос в YandexGPT: принимает OpenAI-style messages (role/content),
 * возвращает строку-ответ. Ошибки бросает исключением с человекочитаемым текстом.
 */
export async function callYandexChat(
  messages: OpenAIStyleMessage[],
  options: YandexChatOptions = {},
): Promise<YandexChatResult> {
  const apiKey = options.apiKey ?? readEnv("YANDEX_AI_STUDIO_API_KEY");
  const folderId = options.folderId ?? readEnv("YANDEX_CLOUD_FOLDER_ID");

  if (!apiKey) {
    throw new Error("YANDEX_AI_STUDIO_API_KEY не задан");
  }
  if (!folderId) {
    throw new Error(
      "YANDEX_CLOUD_FOLDER_ID не задан (не путайте с ID API-ключа или сервис-аккаунта)",
    );
  }

  const model = options.model ?? "yandexgpt";
  const modelUri = resolveYandexModelUri(model, folderId);
  const yandexMessages = openAIToYandexMessages(messages);

  const body = {
    modelUri,
    completionOptions: {
      stream: false,
      temperature: options.temperature ?? 0.7,
      // Yandex ожидает строку
      maxTokens: String(options.maxTokens ?? 2000),
    },
    messages: yandexMessages,
  };

  const response = await fetch(YANDEX_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Api-Key ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[YandexAI] chat error ${response.status}:`,
      errorText.slice(0, 500),
    );
    if (response.status === 401 || response.status === 403) {
      throw new Error("Ошибка авторизации в Yandex AI. Проверьте API ключ и роль сервис-аккаунта.");
    }
    if (response.status === 429) {
      throw new Error("Превышен лимит запросов к Yandex AI. Попробуйте позже.");
    }
    if (response.status >= 500) {
      throw new Error("Сервис ИИ временно недоступен. Попробуйте позже.");
    }
    throw new Error(`Yandex AI error: ${response.status}`);
  }

  const data = (await response.json()) as {
    result?: {
      alternatives?: Array<{ message?: { text?: string } }>;
      modelVersion?: string;
      usage?: YandexChatResult["usage"];
    };
  };

  const text = data.result?.alternatives?.[0]?.message?.text?.trim() ?? "";
  if (!text) {
    console.error("[YandexAI] empty text in response:", JSON.stringify(data).slice(0, 400));
    throw new Error("ИИ вернул пустой ответ");
  }

  return {
    text,
    modelVersion: data.result?.modelVersion,
    usage: data.result?.usage,
  };
}

/**
 * Генерация эмбеддинга Yandex (256-dim).
 * ВНИМАНИЕ: несовместимо по размерности с OpenRouter (1536/3072-dim).
 * Для type="doc" используется text-search-doc, для type="query" — text-search-query.
 */
export async function generateYandexEmbedding(
  text: string,
  type: "doc" | "query" = "doc",
  options: { apiKey?: string; folderId?: string } = {},
): Promise<number[]> {
  const apiKey = options.apiKey ?? readEnv("YANDEX_AI_STUDIO_API_KEY");
  const folderId = options.folderId ?? readEnv("YANDEX_CLOUD_FOLDER_ID");
  if (!apiKey || !folderId) {
    throw new Error("Yandex AI не настроен для embeddings");
  }

  const modelUri = `emb://${folderId}/${
    type === "query" ? "text-search-query" : "text-search-doc"
  }/latest`;

  const response = await fetch(YANDEX_EMBED_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Api-Key ${apiKey}`,
    },
    body: JSON.stringify({ modelUri, text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Yandex embedding error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as { embedding?: number[] };
  if (!Array.isArray(data.embedding)) {
    throw new Error("Yandex embedding: пустой ответ");
  }
  return data.embedding;
}
