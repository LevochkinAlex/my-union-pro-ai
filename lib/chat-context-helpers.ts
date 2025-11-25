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

  // ПОДТВЕРЖДЕНИЕ - ПРОВЕРЯЕМ СНАЧАЛА!
  // Если бот показал значение и ждёт подтверждения - это CONFIRMATION
  // Форматы: "Ваша должность: Врач. Верно?", "Ваша профессия: Хирург. Верно?"
  const hasConfirmationMarker = content.includes("верно?") || 
                                content.includes("правильно?") || 
                                content.includes("все верно") ||
                                content.includes("(да/нет)");
                                
  const hasShownValue = content.includes("ваша должность:") ||
                       content.includes("ваша профессия:") ||
                       content.includes("ваше образование:") ||
                       content.includes("правильная организация") ||
                       content.includes("правильный адрес") ||
                       content.includes("это правильный");
  
  if (hasConfirmationMarker && hasShownValue) {
    return "CONFIRMATION";
  }

  // ДОЛЖНОСТЬ - вопрос о должности (без подтверждения)
  // "Укажите должность", "Какая у вас должность" и т.д.
  if (content.includes("должность") && !content.includes("семейное") && !hasConfirmationMarker) {
    return "JOB_TITLE";
  }

  // ПРОФЕССИЯ - вопрос о профессии (без подтверждения)
  if ((content.includes("профессия") || content.includes("профессию") || content.includes("специальность")) && !hasConfirmationMarker) {
    return "PROFESSION";
  }

  // ОБРАЗОВАНИЕ - вопрос об образовании (без подтверждения)
  if ((content.includes("образование") || content.includes("какое у вас образование")) && !hasConfirmationMarker) {
    return "EDUCATION";
  }

  // ОБЩЕЕ ПОДТВЕРЖДЕНИЕ (для адреса, организации и т.д.)
  if (hasConfirmationMarker) {
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
        enhanced = `${userMessage}\n\n[✅ СИСТЕМА НАШЛА ДОЛЖНОСТЬ В СПРАВОЧНИКЕ: "${validatedData.jobTitle}"]
⚠️ ТВОЯ ЗАДАЧА: Скажи РОВНО так: "Ваша должность: ${validatedData.jobTitle}. Верно? (да/нет)"
❌ ЗАПРЕЩЕНО: подчеркивания ___, плейсхолдеры [...], пустое значение`;
      } else {
        // Если пользователь написал что-то осмысленное (не "да", "нет", "ага")
        const isConfirmationWord = /^(да|нет|ага|угу|верно|правильно|точно)$/i.test(userMessage.trim());
        if (isConfirmationWord) {
          enhanced = `${userMessage}\n\n[⚠️ Пользователь ответил "${userMessage}" но это не название должности. Уточни: "Я не понял вашу должность. Пожалуйста, укажите название должности (например: врач, медсестра, заведующий)"]`;
        } else {
          enhanced = `${userMessage}\n\n[⚠️ ДОЛЖНОСТЬ НЕ НАЙДЕНА В СПРАВОЧНИКЕ. Используй то что написал пользователь: "${userMessage}"]
⚠️ ТВОЯ ЗАДАЧА: Скажи: "Ваша должность: ${userMessage}. Верно? (да/нет)"
❌ ЗАПРЕЩЕНО: подчеркивания ___, плейсхолдеры, пустое поле`;
        }
      }
      break;

    case "PROFESSION":
      if (validatedData?.profession) {
        enhanced = `${userMessage}\n\n[✅ СИСТЕМА НАШЛА ПРОФЕССИЮ В СПРАВОЧНИКЕ: "${validatedData.profession}"]
⚠️ ТВОЯ ЗАДАЧА: Скажи РОВНО так: "Ваша профессия: ${validatedData.profession}. Верно? (да/нет)"
❌ ЗАПРЕЩЕНО: подчеркивания ___, плейсхолдеры [...], пустое значение`;
      } else {
        const isConfirmationWord = /^(да|нет|ага|угу|верно|правильно|точно)$/i.test(userMessage.trim());
        // Проверяем, не указал ли пользователь направление медицины вместо профессии
        const isMedicalDirection = /^(хирургия|терапия|кардиология|неврология|педиатрия|гинекология|урология|офтальмология)$/i.test(userMessage.trim());
        
        if (isConfirmationWord) {
          enhanced = `${userMessage}\n\n[⚠️ Пользователь ответил "${userMessage}" но это не название профессии. Уточни: "Я не понял вашу профессию. Пожалуйста, укажите название профессии (например: врач-хирург, врач-терапевт, медсестра, массажист)"]`;
        } else if (isMedicalDirection) {
          enhanced = `${userMessage}\n\n[⚠️ Пользователь указал НАПРАВЛЕНИЕ МЕДИЦИНЫ ("${userMessage}"), а не ПРОФЕССИЮ]
⚠️ ТВОЯ ЗАДАЧА: Объясни разницу и попроси указать профессию:
"Вы указали направление медицины '${userMessage}', а мне нужна ваша профессия - то есть КЕМ вы работаете. Например:
- Если вы врач этого направления → напишите 'врач-${userMessage.toLowerCase().replace('ия', '')}'
- Если вы медсестра → напишите 'медсестра'
- Если вы фельдшер → напишите 'фельдшер'

Пожалуйста, укажите вашу профессию."`;
        } else {
          enhanced = `${userMessage}\n\n[⚠️ ПРОФЕССИЯ "${userMessage}" НЕ НАЙДЕНА В СПРАВОЧНИКЕ]
⚠️ ТВОЯ ЗАДАЧА: Попроси уточнить или подтвердить:
"Я не нашел профессию '${userMessage}' в нашем справочнике медицинских профессий. 

Пожалуйста, уточните:
- Вы врач какой-то специальности? (например: врач-хирург, врач-терапевт)
- Или вы медсестра, фельдшер, массажист, лаборант?

Или подтвердите что ваша профессия именно: ${userMessage}. Верно? (да/нет)"`;
        }
      }
      break;

    case "EDUCATION":
      enhanced = `${userMessage}\n\n[КОНТЕКСТ: Образование. Это ответ на твой вопрос об образовании. Покажи образование и спроси "Ваше образование: [образование]. Верно?"]`;
      break;

    case "CHILDREN_INFO":
      // Проверяем дату в сообщении пользователя
      const datePattern = /(\d{1,2})[.\s](\d{1,2})[.\s](\d{4})/;
      const dateMatch = userMessage.match(datePattern);
      
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]);
        const childDate = new Date(year, month - 1, day);
        const today = new Date();
        const age = Math.floor((today.getTime() - childDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        
        // Проверка даты в будущем
        if (childDate > today) {
          enhanced = `${userMessage}\n\n[⚠️⚠️⚠️ КРИТИЧЕСКАЯ ОШИБКА: ДАТА В БУДУЩЕМ!]
Дата "${dateMatch[0]}" указывает на будущее время (${childDate.toLocaleDateString('ru-RU')}). Ребенок с такой датой рождения еще не родился!

⚠️ ТВОЯ ЗАДАЧА: Вежливо укажи на ошибку:
"Вы указали дату рождения ${dateMatch[0]}, но эта дата в будущем - ребенок еще не родился! 😊

Пожалуйста, проверьте и укажите правильную дату рождения ребенка в формате ДД.ММ.ГГГГ. Например: 15.03.2020"

❌ НЕ переходи к следующему ребенку! Дождись правильной даты для текущего ребенка.`;
        }
        // Проверка возраста 18+
        else if (age >= 18) {
          enhanced = `${userMessage}\n\n[⚠️ РЕБЕНКУ УЖЕ 18 ЛЕТ (${age} лет)]
Дата рождения: ${childDate.toLocaleDateString('ru-RU')}

⚠️ ТВОЯ ЗАДАЧА: Вежливо объясни:
"К сожалению, мы можем добавить в профиль только детей младше 18 лет. Ребенку с датой рождения ${dateMatch[0]} уже ${age} ${age === 1 ? 'год' : age < 5 ? 'года' : 'лет'}. 

Это ограничение связано с программой подарков для несовершеннолетних детей членов профсоюза. 🎁

Есть ли у вас дети младше 18 лет?"

❌ НЕ добавляй этого ребенка в список! На бэкенде есть защита - дети 18+ не сохранятся.`;
        }
        // Дата корректная
        else {
          enhanced = `${userMessage}\n\n[✅ ДАТА КОРРЕКТНАЯ]
Дата рождения: ${childDate.toLocaleDateString('ru-RU')} (возраст: ${age} ${age === 1 ? 'год' : age < 5 ? 'года' : 'лет'})
Формат может быть разным: "Имя ДД ММ ГГГГ" или "Имя, ДД.ММ.ГГГГ". 
Извлеки имя и дату, покажи для подтверждения.`;
        }
      } else {
        enhanced = `${userMessage}\n\n[КОНТЕКСТ: Данные ребенка (имя и дата рождения). Формат может быть разным: "Имя ДД ММ ГГГГ" или "Имя, ДД.ММ.ГГГГ". Извлеки имя и дату. ⚠️ ВАЖНО: Проверь что дата НЕ В БУДУЩЕМ и ребенку меньше 18 лет.]`;
      }
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

