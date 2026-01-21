/**
 * Утилиты для форматирования времени последней активности
 */

/**
 * Форматирует время последней активности пользователя
 * @param lastSeenAt - Дата последней активности
 * @param isOnline - Онлайн ли пользователь сейчас
 * @returns Форматированная строка типа "был(а) 30 минут назад"
 */
export function formatLastSeen(lastSeenAt: Date | null, isOnline: boolean): string {
  if (isOnline) {
    return "Онлайн";
  }

  if (!lastSeenAt) {
    return "Офлайн";
  }

  const now = new Date();
  const diff = now.getTime() - lastSeenAt.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(diff / 604800000);
  const months = Math.floor(diff / 2592000000); // ~30 дней
  const years = Math.floor(diff / 31536000000); // ~365 дней

  // Определяем пол (для "был/была") - по умолчанию "был(а)"
  // Можно улучшить, если будет информация о поле пользователя
  const genderSuffix = ""; // "был(а)" - универсальный вариант

  if (minutes < 1) {
    return "Был(а) только что";
  } else if (minutes < 60) {
    return `Был(а) ${minutes} ${getMinutesWord(minutes)} назад`;
  } else if (hours < 24) {
    return `Был(а) ${hours} ${getHoursWord(hours)} назад`;
  } else if (days < 7) {
    return `Был(а) ${days} ${getDaysWord(days)} назад`;
  } else if (weeks < 4) {
    return `Был(а) ${weeks} ${getWeeksWord(weeks)} назад`;
  } else if (months < 12) {
    return `Был(а) ${months} ${getMonthsWord(months)} назад`;
  } else {
    return `Был(а) ${years} ${getYearsWord(years)} назад`;
  }
}

function getMinutesWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "минут";
  }
  if (lastDigit === 1) {
    return "минуту";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "минуты";
  }
  return "минут";
}

function getHoursWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "часов";
  }
  if (lastDigit === 1) {
    return "час";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "часа";
  }
  return "часов";
}

function getDaysWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "дней";
  }
  if (lastDigit === 1) {
    return "день";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "дня";
  }
  return "дней";
}

function getWeeksWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "недель";
  }
  if (lastDigit === 1) {
    return "неделю";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "недели";
  }
  return "недель";
}

function getMonthsWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "месяцев";
  }
  if (lastDigit === 1) {
    return "месяц";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "месяца";
  }
  return "месяцев";
}

function getYearsWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "лет";
  }
  if (lastDigit === 1) {
    return "год";
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return "года";
  }
  return "лет";
}
