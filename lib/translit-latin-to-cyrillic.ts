/**
 * Транслитерация латиницы → кириллица (русский).
 * Используется для ФИО из VK ID / Telegram, когда приходят имена латиницей.
 * ГОСТ 7.79-2000 (Б) и типичные варианты для русских имён.
 */
const MULTI: [RegExp, string][] = [
  [/shch/gi, "щ"],
  [/zh/gi, "ж"],
  [/ch/gi, "ч"],
  [/sh/gi, "ш"],
  [/yo/gi, "ё"],
  [/yu/gi, "ю"],
  [/ya/gi, "я"],
  [/ye/gi, "е"],
  [/ey\b/gi, "ей"],
  [/iy\b/gi, "ий"],
  [/ij\b/gi, "ий"],
  [/oy\b/gi, "ой"],
  [/ay\b/gi, "ай"],
  [/ia\b/gi, "ия"],
  [/ia(?=[a-z])/gi, "иа"],
  [/\bje/gi, "е"],
  [/je/gi, "ье"],
  [/ks/gi, "кс"],
  [/ts/gi, "ц"],
  [/x/gi, "кс"],
];

const SINGLE_LOWER: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и", j: "й",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с", t: "т",
  u: "у", f: "ф", h: "х", c: "ц", w: "в", y: "ы",
  "'": "ь", "`": "ь",
};

/** Проверяет, что строка выглядит как латиница (есть латинские буквы и нет кириллицы). */
export function looksLikeLatin(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return /[a-zA-Z]/.test(trimmed) && !/[а-яёА-ЯЁ]/.test(trimmed);
}

/**
 * Транслитерирует строку с латиницы на кириллицу (русский).
 * Если строка уже содержит кириллицу или не похожа на латиницу — возвращает как есть.
 */
export function translitLatinToCyrillic(text: string): string {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return text;
  if (!looksLikeLatin(trimmed)) return text;

  let result = trimmed;
  for (const [re, repl] of MULTI) {
    result = result.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return repl[0].toUpperCase() + repl.slice(1);
      }
      return repl;
    });
  }
  const out: string[] = [];
  for (const c of result) {
    const lower = c.toLowerCase();
    const cyr = SINGLE_LOWER[lower];
    if (cyr) {
      out.push(c === c.toUpperCase() ? cyr[0].toUpperCase() + cyr.slice(1) : cyr);
    } else {
      out.push(c);
    }
  }
  return out.join("");
}
