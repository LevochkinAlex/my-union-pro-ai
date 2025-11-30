/**
 * Утилиты для работы с телефонными номерами
 */

/**
 * Нормализует телефон в формат +7XXXXXXXXXX
 * Убирает все символы кроме цифр, добавляет +7
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Убираем все нецифры
  const digits = phone.replace(/\D/g, "");
  
  if (digits.length === 0) return null;
  
  // Если номер начинается с 8 и имеет 11 цифр - заменяем на 7
  if (digits.length === 11 && digits.startsWith("8")) {
    return "+7" + digits.slice(1);
  }
  
  // Если номер имеет 11 цифр и начинается с 7
  if (digits.length === 11 && digits.startsWith("7")) {
    return "+" + digits;
  }
  
  // Если номер имеет 10 цифр (без кода страны) - добавляем +7
  if (digits.length === 10) {
    return "+7" + digits;
  }
  
  // Если это полный международный номер с 7 - просто добавляем +
  if (digits.length >= 11 && digits.startsWith("7")) {
    return "+" + digits;
  }
  
  // Иначе возвращаем как есть с +
  return "+" + digits;
}

/**
 * Получает только цифры из телефона (для хранения в phoneNormalized)
 */
export function getPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Форматирует телефон для отображения
 * +7 (XXX) XXX-XX-XX
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  
  const normalized = normalizePhone(phone);
  if (!normalized) return phone;
  
  const digits = getPhoneDigits(normalized);
  
  if (digits.length === 11) {
    const code = digits.slice(0, 1);
    const area = digits.slice(1, 4);
    const part1 = digits.slice(4, 7);
    const part2 = digits.slice(7, 9);
    const part3 = digits.slice(9, 11);
    return `+${code} (${area}) ${part1}-${part2}-${part3}`;
  }
  
  return phone;
}

/**
 * Проверяет, являются ли два номера одинаковыми (с учётом разных форматов)
 */
export function isSamePhone(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
  if (!phone1 && !phone2) return true;
  if (!phone1 || !phone2) return false;
  
  const digits1 = getPhoneDigits(phone1);
  const digits2 = getPhoneDigits(phone2);
  
  // Сравниваем последние 10 цифр (без кода страны)
  const last10_1 = digits1.slice(-10);
  const last10_2 = digits2.slice(-10);
  
  return last10_1 === last10_2;
}

/**
 * Проверяет валидность телефона
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  
  const digits = getPhoneDigits(phone);
  
  // Российский номер должен иметь 10 или 11 цифр
  return digits.length >= 10 && digits.length <= 12;
}

/**
 * Маскирует телефон для отображения
 * +7 (***) ***-**-86
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  
  const digits = getPhoneDigits(phone);
  
  if (digits.length >= 10) {
    const last2 = digits.slice(-2);
    return `+7 (***) ***-**-${last2}`;
  }
  
  return "***";
}

