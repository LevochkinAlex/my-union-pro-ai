import { generateYandexEmbedding, isYandexConfigured } from "@/lib/yandex-ai";
import { estimateTokens, logAIUsage } from "@/lib/ai-usage";

/**
 * Унифицированный клиент эмбеддингов.
 *
 * Провайдер — Yandex Foundation Models (256-dim). Разделяем "документы" и "запросы":
 * `text-search-doc` сохраняет смысл для последующего поиска, `text-search-query`
 * оптимизирован для коротких пользовательских запросов. Обратная совместимость:
 * `generateEmbedding(text)` без второго аргумента считает, что это документ.
 *
 * Размерность векторов в БД должна быть 256. Старые записи (1536/3072-dim)
 * игнорируются поиском до перегенерации (`scripts/regen-embeddings-yandex.mjs`).
 *
 * Каждый вызов фиксируется в AIUsageEvent (fire-and-forget). Yandex embedding API
 * не возвращает usage, поэтому tokens считаем по длине текста (≈ 4 chars/token).
 */

export const EMBEDDING_DIM = 256;

export type EmbeddingKind = "doc" | "query";

export async function generateEmbedding(
  text: string,
  kind: EmbeddingKind = "doc",
): Promise<number[]> {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  if (!isYandexConfigured()) {
    throw new Error(
      "Yandex AI Studio не настроен (YANDEX_AI_STUDIO_API_KEY / YANDEX_CLOUD_FOLDER_ID)",
    );
  }

  const model = kind === "query" ? "text-search-query" : "text-search-doc";
  const startedAt = Date.now();
  try {
    const vec = await generateYandexEmbedding(cleaned, kind);
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error("Yandex embeddings: пустой ответ");
    }

    const tokens = estimateTokens(cleaned);
    void logAIUsage({
      operation: "embedding",
      route: `embedding/${kind}`,
      model,
      inputTokens: tokens,
      totalTokens: tokens,
      durationMs: Date.now() - startedAt,
    });

    return vec;
  } catch (err) {
    void logAIUsage({
      operation: "embedding",
      route: `embedding/${kind}`,
      model,
      inputTokens: 0,
      totalTokens: 0,
      durationMs: Date.now() - startedAt,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  return generateEmbedding(text, "query");
}

export async function generateDocEmbedding(text: string): Promise<number[]> {
  return generateEmbedding(text, "doc");
}
