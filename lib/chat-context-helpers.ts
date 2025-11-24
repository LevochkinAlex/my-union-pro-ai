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

  // АДРЕС
  if (
    content.includes("адрес прожива") ||
    content.includes("где вы проживаете") ||
    content.includes("ваш адрес")
  ) {
    return "ADDRESS";
  }

  // ТЕЛЕФОН
  if (content.includes("телефон") || content.includes("номер телефона")) {
    return "PHONE";
  }

  // ДОЛЖНОСТЬ
  if (content.includes("должность") && !content.includes("семейное")) {
    return "JOB_TITLE";
  }

  // ПРОФЕССИЯ
  if (content.includes("профессия") || content.includes("специальность")) {
    return "PROFESSION";
  }

  // ОБРАЗОВАНИЕ
  if (content.includes("образование") || content.includes("какое у вас образование")) {
    return "EDUCATION";
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

  // ПОДТВЕРЖДЕНИЕ (да/нет)
  if (
    content.includes("правильная организация") ||
    content.includes("верно?") ||
    content.includes("все верно") ||
    content.includes("правильно?")
  ) {
    return "CONFIRMATION";
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
    fio?: { lastName: string; firstName: string; middleName?: string };
    dateOfBirth?: Date;
    phone?: string;
  }
): string {
  let enhanced = userMessage;

  switch (context) {
    case "ORGANIZATION":
      if (validatedData?.organization) {
        enhanced = `${userMessage}\n\n---\n✅ ОРГАНИЗАЦИЯ НАЙДЕНА В РЕЕСТРЕ МИНЮСТА РФ:\n[VALIDATED_ORGANIZATION: ${validatedData.organization.name}${validatedData.organization.foundInDatabase ? " (уже в базе МойСоюз)" : " (в реестре Минюста РФ)"}]\n\nОБЯЗАТЕЛЬНО покажи пользователю ПОЛНОЕ официальное название организации и спроси подтверждение: "Я нашел вашу организацию: [ПОЛНОЕ НАЗВАНИЕ]. Это правильная организация? (да/нет)"\n---`;
      } else {
        enhanced = `${userMessage}\n\n[⚠️ ВНИМАНИЕ: Организация "${userMessage}" не найдена в реестре Минюста РФ. Попроси пользователя уточнить название или ввести полное официальное наименование.]`;
      }
      break;

    case "ADDRESS":
      if (validatedData?.address) {
        enhanced = `${userMessage}\n\n---\n✅ АДРЕС ПРОВЕРЕН ЧЕРЕЗ DADATA:\n[VALIDATED_ADDRESS: ${validatedData.address.address}]\n[CITY: ${validatedData.address.city || "не определен"}]\n\nОБЯЗАТЕЛЬНО покажи пользователю полный валидированный адрес и спроси подтверждение: "Ваш адрес: ${validatedData.address.address}. Верно?"\n---`;
      } else {
        enhanced = `${userMessage}\n\n[⚠️ ВНИМАНИЕ: Не удалось проверить адрес через базу данных. Попроси пользователя указать адрес в более полном формате (регион, город, улица, дом, квартира).]`;
      }
      break;

    case "FIO":
      enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь отвечает на вопрос про ФИО. Извлеки Фамилию, Имя, Отчество. ВАЖНО: Тюркские суффиксы "оглы", "улы", "кызы" пишутся с МАЛЕНЬКОЙ буквы и являются ЧАСТЬЮ ОТЧЕСТВА!]`;
      break;

    case "DATE_OF_BIRTH":
      enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь отвечает на вопрос про дату рождения. Формат: ДД.ММ.ГГГГ. ОБЯЗАТЕЛЬНО подтверди: "Ваша дата рождения: [дата]. Верно?"]`;
      break;

    case "PHONE":
      enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь отвечает на вопрос про телефон. Формат: +7 (XXX) XXX-XX-XX. ОБЯЗАТЕЛЬНО подтверди: "Ваш телефон: [номер]. Верно?"]`;
      break;

    case "JOB_TITLE":
      enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь отвечает на вопрос про должность. ОБЯЗАТЕЛЬНО подтверди: "Ваша должность: [должность]. Верно?"]`;
      break;

    case "PROFESSION":
      enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь отвечает на вопрос про профессию. ОБЯЗАТЕЛЬНО подтверди: "Ваша профессия: [профессия]. Верно?"]`;
      break;

    case "EDUCATION":
      enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь отвечает на вопрос про образование. ОБЯЗАТЕЛЬНО подтверди: "Ваше образование: [образование]. Верно?"]`;
      break;

    case "CHILDREN_INFO":
      enhanced = `${userMessage}\n\n[ℹ️ КОНТЕКСТ: Пользователь указывает имя и дату рождения ребенка. Формат может быть: "Имя ДД ММ ГГГГ" или "Имя, ДД.ММ.ГГГГ". Извлеки имя и дату рождения.]`;
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
  return context === "ORGANIZATION" || context === "ADDRESS";
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

