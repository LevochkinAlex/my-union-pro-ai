/**
 * Нормализация org-Bearer из .env (частые причины 401 при «правильном» токене в кабинете BB).
 */
export function normalizeBbOrgTokenFromEnv(raw: string | undefined): string | null {
  if (raw == null) return null;
  let t = String(raw).replace(/\uFEFF/g, ""); // BOM
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "");
  t = t.trim();
  if (!t) return null;
  // Снять одну пару обрамляющих кавычек, если строка целиком в кавычках
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/\n/g, "").trim();
  return t.length ? t : null;
}
