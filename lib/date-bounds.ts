/**
 * Ограничения для полей даты в формах документооборота.
 * Год — не более 4 цифр (диапазон 1900–2100), чтобы избежать ввода типа 275760.
 */

export const DATE_INPUT_MIN = "1900-01-01";
export const DATE_INPUT_MAX = "2100-12-31";

/**
 * Нормализует значение поля type="date" (YYYY-MM-DD): приводит год к диапазону 1900–2100.
 * Учитывает случай, когда в год попало больше 4 цифр (например 275760).
 * Если значение пустое или невалидное — возвращает как есть.
 */
export function normalizeDateInputValue(value: string): string {
  if (!value || typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const match = trimmed.match(/^(\d+)-(\d{1,2})-(\d{1,2})$/);
  if (!match) return value;
  const [, yStr, m, d] = match;
  let y = parseInt(yStr!, 10);
  if (Number.isNaN(y)) return value;
  if (y < 1900) y = 1900;
  if (y > 2100) y = 2100;
  const month = m!.padStart(2, "0");
  const day = d!.padStart(2, "0");
  return `${y}-${month}-${day}`;
}
