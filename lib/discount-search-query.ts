/**
 * Нормализация и варианты строки поиска по каталогу скидок.
 * Решает типичные расхождения с BestBenefits: пробелы в бренде («вкус вилл» vs «ВкусВилл»),
 * мягкие переносы, ё/е.
 */

export function normalizeDiscountSearchInput(raw: string): string {
  return raw
    .trim()
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Паттерны для PostgreSQL ILIKE: исходная строка и вариант без пробелов
 * (чтобы «вкус вилл» находил «ВкусВилл»).
 */
export function discountSearchLikePatterns(raw: string): string[] {
  const n = normalizeDiscountSearchInput(raw).toLowerCase().replace(/ё/g, "е");
  const out = new Set<string>();
  if (n.length < 1) return [];

  out.add(`%${n}%`);
  const compact = n.replace(/\s+/g, "");
  if (compact.length >= 2 && compact !== n) {
    out.add(`%${compact}%`);
  }
  return [...out];
}

/**
 * Дополнительные query-строки для BestBenefits /api/search (часто чувствителен к пробелам).
 */
export function bestBenefitsSearchQueryVariants(raw: string): string[] {
  const n = normalizeDiscountSearchInput(raw);
  const out = new Set<string>();
  if (!n) return [];
  out.add(n);
  const compact = n.replace(/\s+/g, "");
  if (compact.length >= 2 && compact !== n) {
    out.add(compact);
  }
  return [...out];
}
