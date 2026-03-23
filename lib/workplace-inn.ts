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
  "больница",
  "поликлиника",
  "клинический",
  "клиническая",
  "институт",
  "учреждение",
  "здравоохранения",
  "московской",
  "области",
  "минздрава",
  "городская",
  "городской",
  "районная",
  "районный",
  "научно-исследовательский",
  "научно",
  "исследовательский",
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

function normalizeWorkplaceNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`«»]/g, " ")
    .replace(/[.,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Совпадение названия из профиля/DaData с строкой в справочнике привязок.
 * Учитывает случай: пользователь ввёл короткое имя («Воскресенская больница»),
 * а в админке — полное юр. наименование (между словами есть «районная» и т.д.).
 */
export function workplaceNamesMatchForMapping(
  userWorkplaceLabel: string,
  mappingWorkplaceName: string
): boolean {
  const a = normalizeWorkplaceNameForMatch(userWorkplaceLabel);
  const b = normalizeWorkplaceNameForMatch(mappingWorkplaceName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const tokens = workplaceNameSearchTokens(userWorkplaceLabel);
  if (tokens.length >= 2) {
    return tokens.every((t) => b.includes(t));
  }
  // Для одиночного токена допускаем матч только для действительно характерных слов.
  // Иначе слишком высок риск ложной подстановки «чужой» ППО.
  if (tokens.length === 1 && tokens[0].length >= 8) {
    return b.includes(tokens[0]);
  }
  return false;
}
