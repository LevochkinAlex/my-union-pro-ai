import { prisma } from "@/lib/prisma";

/**
 * Учёт расходов ИИ: логирование каждого вызова Yandex Foundation Models
 * в таблицу AIUsageEvent. Читается админской страницей /admin/ai-chat/usage.
 *
 * Философия:
 * - Запись не должна ломать основной флоу. Все вызовы — fire-and-forget (await
 *   не обязателен; если БД упала, пользователь не должен получить ошибку).
 * - Стоимость считаем локально по таблице цен Yandex ниже (официальный прайс
 *   YandexGPT на момент написания: апрель 2026). При изменении — обновить
 *   таблицу и ещё раз пересчитать исторические записи (скриптом, если надо).
 */

/**
 * Цены Yandex Foundation Models в рублях за 1000 токенов.
 * Источник: https://yandex.cloud/ru/docs/foundation-models/pricing
 * Обновлено вручную; Yandex меняет прайс редко.
 */
const YANDEX_PRICING_RUB_PER_1K: Record<
  string,
  { input: number; output: number }
> = {
  yandexgpt: { input: 1.2, output: 1.2 },
  "yandexgpt-lite": { input: 0.2, output: 0.2 },
  "yandexgpt-32k": { input: 1.2, output: 1.2 },
  "yandexgpt-5-pro": { input: 1.5, output: 1.5 },
  "yandexgpt-5-lite": { input: 0.4, output: 0.4 },
  // Эмбеддинги: Yandex считает 0.02 руб / 1000 токенов (всегда input)
  "text-search-doc": { input: 0.02, output: 0 },
  "text-search-query": { input: 0.02, output: 0 },
};

/**
 * Нормализует произвольную строку модели к базовому имени
 * (`gpt://<folder>/yandexgpt/latest` → `yandexgpt`, `YandexGPT-Lite` → `yandexgpt-lite`).
 */
function normalizeModel(model: string): string {
  const m = (model || "").toLowerCase().trim();
  if (!m) return "yandexgpt";
  const uriMatch = m.match(/(?:gpt|emb):\/\/[^/]+\/([^/]+)(?:\/[^/]+)?$/);
  if (uriMatch) return uriMatch[1];
  return m;
}

function calcCostKopecks(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = normalizeModel(model);
  const pricing = YANDEX_PRICING_RUB_PER_1K[key];
  if (!pricing) return 0;
  const rub = (inputTokens * pricing.input) / 1000 + (outputTokens * pricing.output) / 1000;
  return Math.round(rub * 100); // → копейки
}

/**
 * Грубая оценка числа токенов по длине текста.
 * Для Yandex эмбеддингов API не возвращает usage, поэтому считаем эмпирически:
 * русский текст ≈ 4 символа на токен.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return 0;
  return Math.max(1, Math.round(clean.length / 4));
}

export interface LogAIUsageInput {
  operation: "chat" | "embedding";
  route: string;
  model: string;
  inputTokens: number;
  outputTokens?: number;
  totalTokens?: number;
  provider?: string;

  userId?: string | null;
  organizationId?: string | null;
  botId?: string | null;

  durationMs?: number;
  status?: "ok" | "error";
  error?: string;
}

/**
 * Записывает событие usage. Fire-and-forget: ошибки записи не бросаются.
 */
export async function logAIUsage(input: LogAIUsageInput): Promise<void> {
  try {
    const inputTokens = Math.max(0, Math.round(input.inputTokens || 0));
    const outputTokens = Math.max(0, Math.round(input.outputTokens || 0));
    const totalTokens =
      input.totalTokens != null
        ? Math.max(0, Math.round(input.totalTokens))
        : inputTokens + outputTokens;

    const costKopecks = calcCostKopecks(input.model, inputTokens, outputTokens);

    await prisma.aIUsageEvent.create({
      data: {
        provider: input.provider || "yandex",
        model: normalizeModel(input.model),
        operation: input.operation,
        route: input.route,
        inputTokens,
        outputTokens,
        totalTokens,
        costKopecks,
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        botId: input.botId ?? null,
        durationMs: input.durationMs ?? null,
        status: input.status ?? "ok",
        error: input.error ? input.error.slice(0, 2000) : null,
      },
    });
  } catch (err) {
    // Логирование usage никогда не должно ронять вызывающий код
    console.warn("[ai-usage] failed to persist event:", err);
  }
}

/** Человекочитаемая строка стоимости из копеек */
export function formatKopecks(kopecks: number): string {
  const rub = kopecks / 100;
  if (rub >= 1000) return rub.toFixed(0) + " ₽";
  if (rub >= 1) return rub.toFixed(2) + " ₽";
  return (rub * 100).toFixed(0) + " коп.";
}
