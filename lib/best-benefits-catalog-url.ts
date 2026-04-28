/**
 * URL каталога скидок BestBenefits для org-токена (BB_PROFSOYUZY_TOKEN).
 * По умолчанию — интеграция MyUnion; legacy: https://bestbenefits.ru/api/products
 *
 * Переопределение: полный URL списка (без query), например
 *   BEST_BENEFITS_API_URL=https://bestbenefits.ru/api/myunion/products
 */

export const DEFAULT_BB_CATALOG_PRODUCTS_URL =
  "https://bestbenefits.ru/api/myunion/products";

/** Раньше в .env часто клали публичный каталог; org-токен теперь только под /api/myunion/products. */
const LEGACY_ENV_PUBLIC_PRODUCTS = /^https?:\/\/bestbenefits\.ru\/api\/products\/?$/i;

/**
 * Базовый URL списка продуктов с пагинацией (?per_page=&page=).
 */
export function resolveBestBenefitsCatalogProductsUrl(): string {
  const fromEnv = process.env.BEST_BENEFITS_API_URL?.trim();
  if (fromEnv) {
    const normalized = fromEnv.replace(/\/$/, "");
    if (LEGACY_ENV_PUBLIC_PRODUCTS.test(normalized)) {
      return DEFAULT_BB_CATALOG_PRODUCTS_URL;
    }
    return normalized;
  }
  return DEFAULT_BB_CATALOG_PRODUCTS_URL;
}
