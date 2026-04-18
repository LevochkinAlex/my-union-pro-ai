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
 * Источник: Yandex Cloud Billing Detalization (фактические тарифы от апреля 2026).
 * Обновлено вручную; Yandex меняет прайс редко.
 *
 * Важные оговорки:
 * 1. `yandexgpt/latest` сейчас реально ведёт на YandexGPT Pro 5, с тарифом
 *    1.2 ₽/1k токенов на input/output/cached. Короткое имя `yandexgpt` в
 *    нашей таблице соответствует этому тарифу.
 * 2. Yandex отдельной строкой в биллинге показывает "кэшированные токены"
 *    (cached input). API ответа НЕ возвращает их отдельно, поэтому в нашу
 *    таблицу они попадают как обычные input tokens и считаются по тому же
 *    тарифу 1.2 ₽/1k. Расхождение с официальным биллингом Yandex тут
 *    минимальное, т.к. тариф одинаковый.
 * 3. Эмбеддинги в нашей таблице стоят 0.01 ₽/1k. Фактический биллинг Yandex
 *    показывает ~0.0102 ₽/1k — округлили до 0.01.
 */
const YANDEX_PRICING_RUB_PER_1K: Record<
  string,
  { input: number; output: number }
> = {
  // Pro (флагман, /latest = GPT 5 Pro): 1.2 ₽/1k на input + output + cached
  yandexgpt: { input: 1.2, output: 1.2 },
  "yandexgpt-32k": { input: 1.2, output: 1.2 },
  "yandexgpt-5-pro": { input: 1.2, output: 1.2 },
  // Lite: ~0.2 ₽/1k на input/output
  "yandexgpt-lite": { input: 0.2, output: 0.2 },
  "yandexgpt-5-lite": { input: 0.2, output: 0.2 },
  // Эмбеддинги: 0.01 ₽/1k токенов (всегда input-only)
  "text-search-doc": { input: 0.01, output: 0 },
  "text-search-query": { input: 0.01, output: 0 },
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
