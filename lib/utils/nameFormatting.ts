/**
 * Форматирует имя с большой буквы
 * Учитывает составные имена через дефис
 * Исключения: "оглы" и "кызы" остаются с маленькой буквы
 */
export function capitalizeName(name: string): string {
  if (!name) return "";

  // Тюркские суффиксы отчества, которые должны быть с маленькой буквы
  const turkicSuffixes = ["оглы", "кызы", "огли", "кызы"];
  
  const lowerName = name.toLowerCase();
  
  // Если это тюркский суффикс, возвращаем как есть (с маленькой буквы)
  if (turkicSuffixes.includes(lowerName)) {
    return lowerName;
  }

  return lowerName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

/**
 * Форматирует полное имя (ФИО)
 * Учитывает тюркские суффиксы "оглы" и "кызы" (остаются с маленькой буквы)
 */
export function formatFullName(
  lastName?: string | null,
  firstName?: string | null,
  middleName?: string | null
): string {
  const parts = [
    lastName ? capitalizeName(lastName) : "",
    firstName ? capitalizeName(firstName) : "",
    middleName ? capitalizeName(middleName) : "",
  ].filter(Boolean);

  return parts.join(" ");
}

