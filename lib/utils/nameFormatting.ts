/**
 * Форматирует имя с большой буквы
 * Учитывает составные имена через дефис
 */
export function capitalizeName(name: string): string {
  if (!name) return "";

  return name
    .toLowerCase()
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

/**
 * Форматирует полное имя (ФИО)
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

