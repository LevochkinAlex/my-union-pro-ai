/**
 * Помощники для контекстной обработки сообщений в чате
 * Определяют, о чем спрашивал бот в последнем сообщении
 */

import type { ChatMessage } from "@prisma/client";

export type BotQuestionContext = 
  | "REGION" 
  | "ORGANIZATION" 
  | "FIO" 
  | "DATE_OF_BIRTH" 
  | "ADDRESS" 
  | "PHONE" 
  | "JOB_TITLE" 
  | "PROFESSION" 
  | "EDUCATION"
  | "EMPLOYMENT_STATUS"
  | "MARITAL_STATUS"
  | "SPOUSE_INFO"
  | "HAS_CHILDREN"
  | "CHILDREN_INFO"
  | "HOBBIES"
  | "ABOUT_ME"
  | "ADDITIONAL_INFO"
  | "CONFIRMATION"
  | "UNKNOWN";

/**
 * Определяет контекст последнего вопроса бота
 */
export function detectBotQuestionContext(lastBotMessage: ChatMessage | null): BotQuestionContext {
  if (!lastBotMessage || lastBotMessage.role !== "assistant") {
    return "UNKNOWN";
  }

  const content = lastBotMessage.content.toLowerCase();

  // РЕГИОН
  if (content.includes("регион") && content.includes("россии")) {
    return "REGION";
  }

  // ОРГАНИЗАЦИЯ
  if (
    content.includes("наименование организации") ||
    content.includes("название организации") ||
    content.includes("в которой вы работаете") ||
    content.includes("где вы работаете") ||
    content.includes("место работы")
  ) {
    return "ORGANIZATION";
  }

  // ФИО
  if (
    (content.includes("фамили") && content.includes("имя") && content.includes("отчество")) ||
    content.includes("укажите вашу фамилию") ||
    content.includes("полное имя")
  ) {
    return "FIO";
  }

  // ДАТА РОЖДЕНИЯ
  if (content.includes("дата рождения") || content.includes("когда вы родились")) {
    return "DATE_OF_BIRTH";
  }

  // АДРЕС (проверяем ДО подтверждения, чтобы правильно определить контекст)
  if (
    content.includes("адрес прожива") ||
    content.includes("укажите ваш адрес") ||
    content.includes("укажите адрес") ||
    content.includes("где вы проживаете") ||
    content.includes("не удалось распознать адрес") ||
    content.includes("попробуйте указать") && content.includes("город") ||
    (content.includes("адрес") && (content.includes("укажите") || content.includes("полный") || content.includes("детализац"))) &&
    !content.includes("правильный адрес") && // Исключаем подтверждения
    !content.includes("верно?") // Исключаем подтверждения
  ) {
    return "ADDRESS";
  }

  // ТЕЛЕФОН
  if (content.includes("телефон") || content.includes("номер телефона")) {
    return "PHONE";
  }

  // ДОЛЖНОСТЬ - ПРИОРИТЕТ! Проверяем ДО подтверждения
  // Даже если есть "верно?", но также есть "должность" - это JOB_TITLE
  if (content.includes("должность") && !content.includes("семейное")) {
    return "JOB_TITLE";
  }

  // ПРОФЕССИЯ - ПРИОРИТЕТ! Проверяем ДО подтверждения
  // Даже если есть "верно?", но также есть "профессия" - это PROFESSION
  if (content.includes("профессия") || content.includes("специальность")) {
    return "PROFESSION";
  }

  // ОБРАЗОВАНИЕ - ПРИОРИТЕТ! Проверяем ДО подтверждения
  if (content.includes("образование") || content.includes("какое у вас образование")) {
    return "EDUCATION";
  }

  // ПОДТВЕРЖДЕНИЕ - проверяем ПОСЛЕ должности/профессии/образования!
  // Если бот спросил "Верно?" или "Это правильный адрес? (да/нет)", это CONFIRMATION
  if (
    content.includes("правильная организация") ||
    content.includes("верно?") ||
    content.includes("все верно") ||
    content.includes("правильно?") ||
    (content.includes("это правильный") && (content.includes("адрес") || content.includes("организац"))) ||
    (content.includes("(да/нет)") && (content.includes("адрес") || content.includes("верно")))
  ) {
    return "CONFIRMATION";
  }

  // ЗАНЯТОСТЬ
  if (content.includes("занятость") && (content.includes("работа") || content.includes("учеба") || content.includes("пенсия"))) {
    return "EMPLOYMENT_STATUS";
  }

  // СЕМЕЙНОЕ ПОЛОЖЕНИЕ
  if (content.includes("семейное положение") || (content.includes("женат") && content.includes("замужем"))) {
    return "MARITAL_STATUS";
  }

  // СУПРУГ(А)
  if (content.includes("супруг") && !content.includes("семейное положение")) {
    return "SPOUSE_INFO";
  }

  // ЕСТЬ ЛИ ДЕТИ
  if (content.includes("есть ли у вас дети") || content.includes("дети есть")) {
    return "HAS_CHILDREN";
  }

  // ИНФОРМАЦИЯ О ДЕТЯХ (имя и дата рождения)
  if (
    (content.includes("имя") && content.includes("дата рождения") && content.includes("ребенка")) ||
    (content.includes("укажите") && content.includes("ребенка"))
  ) {
    return "CHILDREN_INFO";
  }

  // ХОББИ
  if (content.includes("хобби") || content.includes("увлечения")) {
    return "HOBBIES";
  }

  // О СЕБЕ
  if ((content.includes("о себе") || content.includes("характер")) && content.includes("вдохновляет")) {
    return "ABOUT_ME";
  }

  // ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ
  if (content.includes("еще") && content.includes("рассказать")) {
    return "ADDITIONAL_INFO";
  }

  return "UNKNOWN";
}

/**
 * Форматирует сообщение пользователя для AI с учетом контекста
 */
export function enhanceUserMessageWithContext(
  userMessage: string,
  context: BotQuestionContext,
  validatedData?: {
    address?: { address: string; city: string | null };
    organization?: { name: string; foundInDatabase: boolean; id?: string };
    fio?: { lastName: string; firstName: string; middleName?: string; validated: boolean };
    dateOfBirth?: Date;
    phone?: string;
    jobTitle?: string;
    profession?: string;
  }
): string {
  let enhanced = userMessage;

  switch (context) {
    case "ORGANIZATION":
      if (validatedData?.organization) {
        enhanced = `${userMessage}\n\n[✅ СИСТЕМА НАШЛА ОРГАНИЗАЦИЮ В РЕЕСТРЕ МИНЮСТА РФ: "${validatedData.organization.name}"${validatedData.organization.foundInDatabase ? " (уже в базе)" : ""}. Покажи пользователю это полное официальное название и спроси "Это правильная организация? (да/нет)"]`;
      } else {
        enhanced = `${userMessage}\n\n[⚠️ ОРГАНИЗАЦИЯ НЕ НАЙДЕНА в реестре Минюста РФ. Попроси уточнить название.]`;
      }
      break;

    case "ADDRESS":
      if (validatedData?.address) {
        enhanced = `${userMessage}\n\n[✅ СИСТЕМА ПРОВЕРИЛА АДРЕС: "${validatedData.address.address}", город: ${validatedData.address.city || "не определен"}. Покажи пользователю полный адрес и спроси "Верно? (да/нет)"]`;
      } else {
        enhanced = `${userMessage}\n\n[⚠️ АДРЕС НЕ РАСПОЗНАН. ❌ НЕ перечисляй компоненты списком! Скажи: "Не могу распознать адрес. Попробуйте добавить регион: Татарстан, Набережные Челны, Чулман 11, квартира 141" - дай один пример с регионом.]`;
      }
      break;

    case "FIO":
      if (validatedData?.fio) {
        enhanced = `${userMessage}\n\n[✅ СИСТЕМА ПРОВЕРИЛА ФИО ЧЕРЕЗ DADATA: ${validatedData.fio.lastName} ${validatedData.fio.firstName} ${validatedData.fio.middleName || ''}. Покажи пользователю это ФИО и спроси "Верно? (да/нет)"]`;
      } else {
        enhanced = `${userMessage}\n\n[КОНТЕКСТ: ФИО. Извлеки фамилию, имя, отчество. Тюркские суффиксы "улы"/"оглы"/"кызы" - часть отчества, пишутся с маленькой буквы!]`;
      }
      break;

    case "DATE_OF_BIRTH":
      enhanced = `${userMessage}\n\n[КОНТЕКСТ: Дата рождения. Распознай дату (формат ДД.ММ.ГГГГ) и покажи пользователю для подтверждения.]`;
      break;

    case "PHONE":
      enhanced = `${userMessage}\n\n[КОНТЕКСТ: Телефон. Распознай номер (формат +7 XXX XXX-XX-XX) и покажи для подтверждения.]`;
      break;

    case "JOB_TITLE":
      if (validatedData?.jobTitle) {
        enhanced = `${userMessage}\n\n[✅ СИСТЕМА НАШЛА В СПРАВОЧНИКЕ: "${validatedData.jobTitle}". ⚠️ ОБЯЗАТЕЛЬНО скопируй ТОЧНОЕ значение "${validatedData.jobTitle}" в свой ответ! НЕ используй подчеркивания или плейсхолдеры! Скажи: "Ваша должность: ${validatedData.jobTitle}. Верно? (да/нет)"]`;
      } else {
        enhanced = `${userMessage}\n\n[⚠️ ДОЛЖНОСТЬ НЕ НАЙДЕНА В СПРАВОЧНИКЕ. Попроси уточнить или подтверди то, что написал пользователь.]`;
      }
      break;

    case "PROFESSION":
      if (validatedData?.profession) {
        enhanced = `${userMessage}\n\n[✅ СИСТЕМА НАШЛА В СПРАВОЧНИКЕ: "${validatedData.profession}". ⚠️ ОБЯЗАТЕЛЬНО скопируй ТОЧНОЕ значение "${validatedData.profession}" в свой ответ! НЕ используй подчеркивания или плейсхолдеры! Скажи: "Ваша профессия: ${validatedData.profession}. Верно? (да/нет)"]`;
      } else {
        enhanced = `${userMessage}\n\n[⚠️ ПРОФЕССИЯ НЕ НАЙДЕНА В СПРАВОЧНИКЕ. Попроси уточнить или подтверди то, что написал пользователь.]`;
      }
      break;

    case "EDUCATION":
      enhanced = `${userMessage}\n\n[КОНТЕКСТ: Образование. Это ответ на твой вопрос об образовании. Покажи образование и спроси "Ваше образование: [образование]. Верно?"]`;
      break;

    case "CHILDREN_INFO":
      enhanced = `${userMessage}\n\n[КОНТЕКСТ: Данные ребенка (имя и дата рождения). Формат может быть разным: "Имя ДД ММ ГГГГ" или "Имя, ДД.ММ.ГГГГ". Извлеки имя и дату. ⚠️ ВАЖНО: Если ребенку УЖЕ 18 лет, скажи что можем добавить только детей младше 18 лет (программа подарков для несовершеннолетних). На бэкенде есть защита - дети 18+ не сохранятся.]`;
      break;

    default:
      // Для остальных контекстов просто добавляем маркер
      if (context !== "UNKNOWN" && context !== "CONFIRMATION") {
        enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь отвечает на вопрос про ${context}]`;
      }
  }

  return enhanced;
}

/**
 * Проверяет, нужна ли валидация для данного контекста
 */
export function requiresValidation(context: BotQuestionContext): boolean {
  return context === "ORGANIZATION" || context === "ADDRESS" || context === "JOB_TITLE" || context === "PROFESSION" || context === "FIO";
}

/**
 * Логирует контекст для отладки
 */
export function logContext(context: BotQuestionContext, userMessage: string) {
  const emoji = {
    REGION: "🌍",
    ORGANIZATION: "🏢",
    FIO: "👤",
    DATE_OF_BIRTH: "📅",
    ADDRESS: "📍",
    PHONE: "📱",
    JOB_TITLE: "💼",
    PROFESSION: "🎓",
    EDUCATION: "📚",
    EMPLOYMENT_STATUS: "💻",
    MARITAL_STATUS: "💑",
    SPOUSE_INFO: "👫",
    HAS_CHILDREN: "👶",
    CHILDREN_INFO: "🎂",
    HOBBIES: "🎨",
    ABOUT_ME: "✨",
    ADDITIONAL_INFO: "📝",
    CONFIRMATION: "✅",
    UNKNOWN: "❓",
  };

  console.log(
    `[chat-context] ${emoji[context]} Detected context: ${context} | User message: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? "..." : ""}"`
  );
}

