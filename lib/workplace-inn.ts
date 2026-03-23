/**
 * Нормализация ИНН места работы для сопоставления со справочником.
 * В БД и из DaData ИНН иногда приходит с пробелами/символами; в справочнике могли сохранить иначе.
 */

/** Только цифры ИНН (10 или 12 для РФ). */
export function workplaceInnDigits(inn: string | null | undefined): string {
  if (!inn) return "";
  return inn.replace(/\D/g, "");
}

/** Варианты строки ИНН для точного поиска в колонке workplaceInn. */
export function workplaceInnSearchVariants(inn: string | null | undefined): string[] {
  const raw = (inn ?? "").trim();
  const digits = workplaceInnDigits(inn);
  const set = new Set<string>();
  if (raw) set.add(raw);
  if (digits) set.add(digits);
  return [...set];
}

const WORKPLACE_NAME_STOPWORDS = new Set([
  "гбуз",
  "гбу",
  "ооо",
  "ао",
  "пао",
  "фгбу",
  "мбу",
  "фгуп",
  "акционерное",
  "общество",
  "закрытым",
  "огрн",
  "имени",
  "им",
  "филиал",
]);

/**
 * Значимые слова из названия места работы для нечёткого поиска в справочнике
 * (когда полное юр. название из DaData не совпало с тем, что внесли в админке).
 */
export function workplaceNameSearchTokens(name: string | null | undefined): string[] {
  if (!name?.trim()) return [];
  const cleaned = name
    .replace(/[«»"""'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zа-яё0-9-]/gi, ""))
    .filter((w) => w.length >= 4 && !WORKPLACE_NAME_STOPWORDS.has(w));
  // Уникальные, более длинные слова важнее — сортируем по длине
  const uniq = [...new Set(tokens)].sort((a, b) => b.length - a.length);
  return uniq.slice(0, 4);
}
