/**
 * Детекция ликвидации по тексту сводки ЕГРЮЛ/ЕГРИП и полям строки поиска ФНС.
 * Сайт egrul.nalog.ru неофициален; поля строки могут меняться — см. summarizeEgrulRow.
 */

export type EgrulSearchRow = {
  c?: string;
  n?: string;
  g?: string;
  i?: string;
  o?: string;
  /** У ряда прекративших деятельность организаций присутствует дата (ДД.ММ.ГГГГ) */
  e?: string;
  k?: string;
  rn?: string;
  r?: string;
  [key: string]: unknown;
};

export function normalizeEgrulText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е")
    .trim();
}

/** Собирает читаемую сводку для БД и для эвристик */
export function summarizeEgrulRow(row: EgrulSearchRow | null | undefined): string {
  if (!row || typeof row !== "object") return "";
  const parts: string[] = [];
  if (row.n) parts.push(String(row.n));
  if (row.c) parts.push(String(row.c));
  if (row.g) parts.push(String(row.g));
  if (row.rn) parts.push(`Регион: ${row.rn}`);
  if (row.r) parts.push(`ОГРН присвоен: ${row.r}`);
  if (row.e && String(row.e).trim()) {
    parts.push(`Сведения о прекращении (поле e): ${String(row.e).trim()}`);
  }
  return parts.join(" | ").trim();
}

const LIQUIDATION_SUBSTRINGS = [
  "ликвидирован",
  "находится в процессе ликвидации",
  "в процессе ликвидации",
  "ликвидационная комиссия",
  "ликвидационн", // «…(ЛИКВИДАЦИОННАЯ КОМИССИЯ)»
  /** В выдаче egrul.nalog.ru поле `g`: «ПРЕДСТАВИТЕЛЬ ЛИКВИДАТОРА: …» — ЮЛ в процессе ликвидации */
  "представитель ликвидатора",
  "ликвидатор", // «ЛИКВИДАТОРА», «ликвидатор:» и т.п.
  "принудительной ликвидации",
  "процессе принудительной ликвидации",
  "прекратило деятельность",
  "прекращение деятельности",
  "исключен из егрюл",
  "исключено из егрюл",
  "снят с учета в связи с ликвидацией",
  "прекращении деятельности юридического лица",
] as const;

const FALSE_POSITIVE = [
  "не ликвидирован",
  "не находится в процессе ликвидации",
  /** «… не является ликвидатором» и т.п. — не блокируем по одному слову */
  "не является ликвидатор",
  "не ликвидатор",
];

/**
 * true, если в реестре указана дата прекращения (типично для ликвидированных ЮЛ/ИП в выдаче ФНС).
 */
export function hasEgrulTerminationMarker(row: EgrulSearchRow | null | undefined): boolean {
  if (!row?.e) return false;
  const t = String(row.e).trim();
  return t.length > 0;
}

/**
 * Блокировка по требованиям: «Ликвидировано» / «в процессе ликвидации» и эквиваленты в выдаче.
 */
export function detectLiquidationFromSummary(summary: string): boolean {
  const n = normalizeEgrulText(summary);
  if (!n) return false;
  for (const fp of FALSE_POSITIVE) {
    if (n.includes(fp)) return false;
  }
  for (const frag of LIQUIDATION_SUBSTRINGS) {
    if (n.includes(frag)) return true;
  }
  return false;
}

export function shouldBlockPartnerForLiquidation(
  row: EgrulSearchRow | null | undefined,
  summary: string
): boolean {
  if (hasEgrulTerminationMarker(row)) return true;
  return detectLiquidationFromSummary(summary);
}
