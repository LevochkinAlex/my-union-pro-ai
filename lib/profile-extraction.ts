import { validateAddressWithDaData } from "./dadata";
import { detectGenderByName } from "./utils/genderDetector";

/**
 * Извлекает структурированные данные из сообщений бота
 * Бот перечисляет собранные данные в формате:
 * "1. **ФИО**: Иванов Иван Иванович"
 * "2. **Дата рождения**: 12.02.1970"
 * и т.д.
 */
function extractStructuredDataFromBot(
  botMessages: Array<{ role: string; content: string }>
): Record<string, any> {
  const extracted: any = {};
  
  // Ищем последнее сообщение бота с подтверждением данных
  // Это сообщение со словами "проверим собранные данные" или "Давайте проверим"
  const confirmationMessage = botMessages
    .reverse()
    .find(msg => 
      (msg.content.includes('проверим') && msg.content.includes('данные')) ||
      msg.content.includes('собранные данные') || 
      msg.content.includes('Давайте проверим') ||
      (msg.content.includes('собрали') && (msg.content.includes('**ФИО**') || msg.content.includes('**Дата рождения**')))
    );
  
  if (!confirmationMessage) {
    console.log('[profile-extraction] No confirmation message found with structured data');
    return extracted;
  }
  
  console.log('[profile-extraction] Found confirmation message:', confirmationMessage.content.substring(0, 200));
  const text = confirmationMessage.content;
  
  // ФИО: "1. **ФИО**: Иванов Иван Иванович" или "**ФИО**: Иванов Иван Иванович"
  // Поддержка тюркских суффиксов: оглы, кызы, улы, кызы (с маленькой буквы)
  const fioPattern = /(?:\d+\.\s*)?\*\*ФИО\*\*[:\s]+([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+(?:\s+(?:оглы|улы|кызы))?))?/;
  const fioMatch = text.match(fioPattern);
  if (fioMatch) {
    extracted.lastName = fioMatch[1].trim();
    extracted.firstName = fioMatch[2].trim();
    if (fioMatch[3]) {
      extracted.middleName = fioMatch[3].trim();
    }
    console.log('[profile-extraction] Extracted FIO:', extracted.lastName, extracted.firstName, extracted.middleName);
  }
  
  // Дата рождения: "2. **Дата рождения**: 12.02.1970"
  const dobPattern = /(?:\d+\.\s*)?\*\*Дата рождения\*\*[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/;
  const dobMatch = text.match(dobPattern);
  if (dobMatch) {
    const [day, month, year] = dobMatch[1].split('.').map(Number);
    extracted.dateOfBirth = new Date(year, month - 1, day);
    console.log('[profile-extraction] Extracted DOB:', extracted.dateOfBirth);
  }
  
  // Адрес: "3. **Адрес**: Производственная 8к2, Москва"
  const addressPattern = /(?:\d+\.\s*)?\*\*Адрес\*\*[:\s]+([^\n]+?)(?:\n|$)/;
  const addressMatch = text.match(addressPattern);
  if (addressMatch) {
    extracted.address = addressMatch[1].trim();
    console.log('[profile-extraction] Extracted Address:', extracted.address);
  }
  
  // Телефон: "4. **Телефон**: +7 (963) 977-12-86"
  const phonePattern = /(?:\d+\.\s*)?\*\*Телефон\*\*[:\s]+(\+?[7-8][^\n]+?)(?:\n|$)/;
  const phoneMatch = text.match(phonePattern);
  if (phoneMatch) {
    extracted.phone = phoneMatch[1].trim();
    console.log('[profile-extraction] Extracted Phone:', extracted.phone);
  }
  
  // Должность: "5. **Должность**: Зампред"
  const jobPattern = /(?:\d+\.\s*)?\*\*Должность\*\*[:\s]+([^\n]+?)(?:\n|$)/;
  const jobMatch = text.match(jobPattern);
  if (jobMatch) {
    extracted.jobTitle = jobMatch[1].trim();
    console.log('[profile-extraction] Extracted Job Title:', extracted.jobTitle);
  }
  
  // Профессия: "6. **Профессия**: Сторож высшего разряда"
  const professionPattern = /(?:\d+\.\s*)?\*\*Профессия\*\*[:\s]+([^\n]+?)(?:\n|$)/;
  const professionMatch = text.match(professionPattern);
  if (professionMatch) {
    extracted.profession = professionMatch[1].trim();
    console.log('[profile-extraction] Extracted Profession:', extracted.profession);
  }
  
  // Образование: "7. **Образование**: Основное общее (9 классов)"
  const educationPattern = /(?:\d+\.\s*)?\*\*Образование\*\*[:\s]+([^\n]+?)(?:\n|$)/;
  const educationMatch = text.match(educationPattern);
  if (educationMatch) {
    extracted.education = educationMatch[1].trim();
    console.log('[profile-extraction] Extracted Education:', extracted.education);
  }
  
  // Организация: "8. **Организация**: МООП РЗ РФ"
  const orgPattern = /(?:\d+\.\s*)?\*\*Организация\*\*[:\s]+([^\n]+?)(?:\n|$)/;
  const orgMatch = text.match(orgPattern);
  if (orgMatch) {
    extracted.organizationName = orgMatch[1].trim();
    console.log('[profile-extraction] Extracted Organization:', extracted.organizationName);
  }
  
  console.log('[profile-extraction] Total extracted fields:', Object.keys(extracted).length);
  return extracted;
}

// Русские месяцы для разбора естественных дат
const RUSSIAN_MONTHS: Record<string, number> = {
  январь: 1, янв: 1,
  февраль: 2, фев: 2,
  март: 3, мар: 3,
  апрель: 4, апр: 4,
  май: 5,
  июнь: 6, июн: 6,
  июль: 7, июл: 7,
  август: 8, авг: 8,
  сентябрь: 9, сен: 9, сент: 9,
  октябрь: 10, окт: 10,
  ноябрь: 11, ноя: 11,
  декабрь: 12, дек: 12,
};

/**
 * Парсит дату в различных форматах:
 * - 12.02.1970
 * - 12/02/1970
 * - 12-02-1970
 * - 12 февраля 1970
 * - 12 фев 1970
 * - 12 февраль 1970
 */
function parseDateFlexible(dateStr: string): Date | null {
  if (!dateStr) return null;

  dateStr = dateStr.trim().toLowerCase();

  // Формат с разделителями: 12.02.1970, 12/02/1970, 12-02-1970
  const numericPattern = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/;
  const numericMatch = dateStr.match(numericPattern);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    const d = parseInt(day);
    const m = parseInt(month);
    const y = parseInt(year);
    
    if (d > 0 && d <= 31 && m > 0 && m <= 12 && y > 1900 && y < 2100) {
      return new Date(y, m - 1, d);
    }
  }

  // Естественный формат: 12 февраля 1970, 12 фев 1970
  const naturalPattern = /(\d{1,2})\s+([а-яё]+)\s+(\d{4})/;
  const naturalMatch = dateStr.match(naturalPattern);
  if (naturalMatch) {
    const [, day, monthName, year] = naturalMatch;
    const d = parseInt(day);
    const y = parseInt(year);
    
    // Пытаемся найти месяц - сначала точное совпадение, потом по началу
    let month = RUSSIAN_MONTHS[monthName];
    if (!month) {
      // Попробуем найти по началу
      for (const [key, value] of Object.entries(RUSSIAN_MONTHS)) {
        if (key.startsWith(monthName)) {
          month = value;
          break;
        }
      }
    }
    
    if (month && d > 0 && d <= 31 && y > 1900 && y < 2100) {
      return new Date(y, month - 1, d);
    }
  }

  return null;
}

/**
 * Очищает и нормализует адрес
 */
function normalizeAddress(address: string): string {
  if (!address) return "";
  
  return address
    .trim()
    .replace(/\s+/g, " ")
    .replace(/,\s+/g, ", ");
}

/**
 * Извлекает профиль данные из сообщений чата
 */
export async function extractProfileDataFromMessages(
  messages: Array<{ role: string; content: string }>
): Promise<Record<string, any>> {
  const profileData: any = {};

  // ВАЖНО: Сначала пытаемся найти структурированные данные из сообщений бота
  // Бот перечисляет собранные данные в формате "1. **ФИО**: Иванов Иван Иванович"
  const botMessages = messages.filter(msg => msg.role === 'assistant');
  const structuredData = extractStructuredDataFromBot(botMessages);
  
  // Приоритет структурированным данным - они точнее, чем fallback-поиск
  let hasStructuredData = false;
  if (Object.keys(structuredData).length > 0) {
    console.log('[profile-extraction] ✅ Found structured data from bot:', structuredData);
    Object.assign(profileData, structuredData);
    hasStructuredData = true;
  } else {
    console.log('[profile-extraction] ⚠️ No structured data found, will use fallback extraction');
  }

  // Join all text for analysis (fallback если структурированные данные не найдены)
  // ⚠️ ВАЖНО: Для fallback используем ТОЛЬКО сообщения пользователя,
  // чтобы избежать извлечения данных из списков вариантов, которые перечисляет бот
  const allText = messages
    .map((msg) => msg.content)
    .join("\n");
  
  // Для fallback-извлечения используем только сообщения пользователя
  const userOnlyText = messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .join("\n");

  // Extract region (регион России)
  const regionPattern = /(?:регион|область|край|республика)[\s:]+([А-ЯЁ][а-яё\s-]+(?:область|край|республика|автономный округ)?)/i;
  const regionMatch = allText.match(regionPattern);
  if (regionMatch) {
    profileData.region = regionMatch[1].trim();
  }

  // Extract preferred discount city (город для скидок)
  // Ищем упоминания городов: "из Казани", "живу в Москве", "г. Санкт-Петербург", "г Набережные Челны" и т.д.
  // Важно: берем ВСЕ слова города, включая составные названия (Нижний Новгород, Набережные Челны)
  const cityPatterns = [
    /(?:из|живу в|нахожусь в|город)\s+г?\.?\s*([А-ЯЁ][а-яёА-ЯЁ\-\s]+?)(?=\s*,|\s*$|\s+\d)/i,
    /г\.?\s+([А-ЯЁ][а-яёА-ЯЁ\-\s]+?)(?=\s*,|\s*$|\s+\d)/i,
    /город\s+([А-ЯЁ][а-яёА-ЯЁ\-\s]+?)(?=\s*,|\s*$|\s+\d)/i,
  ];
  
  for (const pattern of cityPatterns) {
    const cityMatch = allText.match(pattern);
    if (cityMatch && cityMatch[1]) {
      const city = cityMatch[1].trim();
      // Фильтруем служебные слова
      if (!['Россия', 'Федерация', 'Область', 'Край', 'Республика'].includes(city)) {
        profileData.preferredDiscountCity = city;
        break; // Берем первое найденное упоминание города
      }
    }
  }

  // ========== ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ==========
  
  // 🔥 НОВЫЙ ПОДХОД: Контекстный анализ диалога (вопрос бота -> ответ пользователя)
  // Ищем пары: бот спрашивает -> пользователь отвечает
  
  for (let i = 0; i < messages.length - 1; i++) {
    const currentMsg = messages[i];
    const nextMsg = messages[i + 1];
    
    // Пропускаем если это не диалог бот->пользователь
    if (currentMsg.role !== 'assistant' || nextMsg.role !== 'user') continue;
    
    const botQuestion = currentMsg.content.toLowerCase();
    const userAnswer = nextMsg.content.trim();
    
    // ЗАНЯТОСТЬ (employmentStatus)
    if (botQuestion.includes('занятость') && (botQuestion.includes('работа') || botQuestion.includes('учеба') || botQuestion.includes('пенсия'))) {
      const answer = userAnswer.toLowerCase();
      if (answer.includes('работа') || answer.includes('работаю')) {
        profileData.employmentStatus = 'WORK';
        console.log('[profile-extraction] ✅ Extracted employmentStatus: WORK');
      } else if (answer.includes('учеба') || answer.includes('учусь') || answer.includes('студент')) {
        profileData.employmentStatus = 'STUDY';
        console.log('[profile-extraction] ✅ Extracted employmentStatus: STUDY');
      } else if (answer.includes('пенси') || answer.includes('на пенсии') || answer.includes('пенсионер')) {
        profileData.employmentStatus = 'RETIREMENT';
        console.log('[profile-extraction] ✅ Extracted employmentStatus: RETIREMENT');
    }
  }

    // СЕМЕЙНОЕ ПОЛОЖЕНИЕ (maritalStatus)
    if (botQuestion.includes('семейное положение') || (botQuestion.includes('женат') && botQuestion.includes('замужем'))) {
      const answer = userAnswer.toLowerCase();
      if (answer.includes('замужем') || answer.includes('женат') || answer.includes('в браке')) {
        profileData.maritalStatus = 'MARRIED';
        console.log('[profile-extraction] ✅ Extracted maritalStatus: MARRIED');
      } else if (answer.includes('холост') || answer.includes('не замужем') || answer.includes('не женат')) {
        profileData.maritalStatus = 'SINGLE';
        console.log('[profile-extraction] ✅ Extracted maritalStatus: SINGLE');
      } else if (answer.includes('развод')) {
        profileData.maritalStatus = 'DIVORCED';
        console.log('[profile-extraction] ✅ Extracted maritalStatus: DIVORCED');
      } else if (answer.includes('вдов')) {
        profileData.maritalStatus = 'WIDOWED';
        console.log('[profile-extraction] ✅ Extracted maritalStatus: WIDOWED');
      } else if (answer.includes('гражданск')) {
        profileData.maritalStatus = 'CIVIL_MARRIAGE';
        console.log('[profile-extraction] ✅ Extracted maritalStatus: CIVIL_MARRIAGE');
      }
    }
    
    // ИНФОРМАЦИЯ О СУПРУГЕ (spouseInfo)
    if (botQuestion.includes('супруг') && userAnswer.length > 5 && !userAnswer.toLowerCase().includes('нет') && !userAnswer.toLowerCase().includes('одинок')) {
      profileData.spouseInfo = userAnswer;
      console.log('[profile-extraction] ✅ Extracted spouseInfo:', userAnswer.substring(0, 50));
  }

    // ЕСТЬ ЛИ ДЕТИ (hasChildren)
    if (botQuestion.includes('есть ли у вас дети') || botQuestion.includes('дети есть')) {
      const answer = userAnswer.toLowerCase();
      if (answer.includes('да') || answer.includes('есть') || answer.match(/^\d+/)) {
        profileData.hasChildren = true;
        console.log('[profile-extraction] ✅ Extracted hasChildren: true');
      } else if (answer.includes('нет')) {
        profileData.hasChildren = false;
        console.log('[profile-extraction] ✅ Extracted hasChildren: false');
      }
    }
    
    // ИНФОРМАЦИЯ О ДЕТЯХ - ИМЯ И ДАТА РОЖДЕНИЯ
    if ((botQuestion.includes('имя') && botQuestion.includes('дата рождения') && botQuestion.includes('ребенка')) ||
        (botQuestion.includes('укажите') && botQuestion.includes('ребенка'))) {
      // Формат: "Рома 01 07 2000" или "Рома, 01.07.2000" или "Рома 01.07.2000"
      const match = userAnswer.match(/([А-ЯЁ][а-яё]+)\s*,?\s*(\d{1,2})\s*[.\s\/-]?\s*(\d{1,2})\s*[.\s\/-]?\s*(\d{4})/);
      if (match) {
        const name = match[1];
        const day = match[2].padStart(2, '0');
        const month = match[3].padStart(2, '0');
        const year = match[4];
        const birthDate = `${year}-${month}-${day}`;
        const gender = detectGenderByName(name);
        
        const childData = { name, birthDate, gender };
        
        // Если уже есть дети в массиве, добавляем к ним
        if (profileData.childrenBirthDates) {
          try {
            const existingChildren = JSON.parse(profileData.childrenBirthDates);
            if (Array.isArray(existingChildren)) {
              existingChildren.push(childData);
              profileData.childrenBirthDates = JSON.stringify(existingChildren);
            } else {
              profileData.childrenBirthDates = JSON.stringify([childData]);
            }
          } catch {
            profileData.childrenBirthDates = JSON.stringify([childData]);
          }
        } else {
          profileData.childrenBirthDates = JSON.stringify([childData]);
        }
        
        profileData.childrenInfo = (profileData.childrenInfo ? profileData.childrenInfo + '; ' : '') + `${name} (${day}.${month}.${year})`;
        console.log('[profile-extraction] ✅ Extracted child:', name, birthDate);
      }
    }
    
    // ХОББИ И УВЛЕЧЕНИЯ (hobbies)
    if (botQuestion.includes('хобби') || botQuestion.includes('увлечения')) {
      if (userAnswer.length > 3 && !userAnswer.toLowerCase().includes('нет') && !userAnswer.toLowerCase().includes('пока нет')) {
        profileData.hobbies = userAnswer;
        console.log('[profile-extraction] ✅ Extracted hobbies:', userAnswer.substring(0, 50));
    }
    }
    
    // О СЕБЕ (aboutMe)
    if ((botQuestion.includes('о себе') || botQuestion.includes('характер')) && botQuestion.includes('вдохновляет')) {
      if (userAnswer.length > 5 && !userAnswer.toLowerCase().includes('нет') && !userAnswer.toLowerCase().includes('пока нет')) {
        profileData.aboutMe = userAnswer;
        console.log('[profile-extraction] ✅ Extracted aboutMe:', userAnswer.substring(0, 50));
      }
  }

    // ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ (additionalInfo)
    if (botQuestion.includes('еще') && botQuestion.includes('рассказать')) {
      if (userAnswer.length > 5 && !userAnswer.toLowerCase().includes('нет') && !userAnswer.toLowerCase().includes('пока нет')) {
        profileData.additionalInfo = userAnswer;
        console.log('[profile-extraction] ✅ Extracted additionalInfo:', userAnswer.substring(0, 50));
      }
    }
  }

  // Extract name patterns (ФИО) - только если не извлечено из структурированных данных
  // Если есть структурированные данные, НЕ перезаписываем их fallback-поиском
  if ((!profileData.firstName || !profileData.lastName) && !hasStructuredData) {
    // Сначала ищем по явным меткам
    // Поддержка тюркских суффиксов: оглы, улы, кызы (с маленькой буквы)
    const fioLabelPattern = /(?:\*\*(?:ФИО|Фамилия|Имя)\*\*|ФИО|Фамилия\s+Имя\s+Отчество)[^:\n]*[:\-–]\s*([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+(?:\s+(?:оглы|улы|кызы))?))?/i;
    const fioLabelMatch = allText.match(fioLabelPattern);
    
    if (fioLabelMatch) {
      // Найдено по метке
      if (fioLabelMatch[3]) {
        profileData.lastName = fioLabelMatch[1].trim();
        profileData.firstName = fioLabelMatch[2].trim();
        profileData.middleName = fioLabelMatch[3].trim();
      } else if (fioLabelMatch[2]) {
        profileData.firstName = fioLabelMatch[1].trim();
        profileData.lastName = fioLabelMatch[2].trim();
      }
    } else {
      // Если не найдено по метке, ищем паттерн, НО исключаем географические названия и служебные слова
      // Поддержка тюркских суффиксов
      const fioPattern = /([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+(?:\s+(?:оглы|улы|кызы))?))?/g;
      const excludeWords = [
        // Географические названия
        'Республика', 'Область', 'Край', 'Округ', 'Регион', 'Город', 'Федерация', 'России', 'Российской',
        'Татарстан', 'Башкортостан', 'Чувашия', 'Удмуртия', 'Мордовия', 'Марий', 'Эл',
        'Москва', 'Петербург', 'Санкт', 'Новгород', 'Нижний', 'Казань', 'Екатеринбург',
        'Челябинск', 'Самара', 'Уфа', 'Ростов', 'Омск', 'Красноярск', 'Воронеж', 'Пермь',
        'Волгоград', 'Саратов', 'Краснодар', 'Тольятти', 'Тюмень', 'Ижевск', 'Барнаул',
        'Ульяновск', 'Иркутск', 'Хабаровск', 'Ярославль', 'Владивосток', 'Махачкала',
        'Томск', 'Оренбург', 'Кемерово', 'Новокузнецк', 'Рязань', 'Астрахань', 'Набережные',
        'Челны', 'Пенза', 'Липецк', 'Киров', 'Чебоксары', 'Калининград', 'Тула', 'Курск',
        'Сочи', 'Ставрополь', 'Улан', 'Удэ', 'Магнитогорск', 'Брянск', 'Иваново', 'Белгород',
        'Сургут', 'Владимир', 'Чита', 'Нижневартовск', 'Архангельск', 'Симферополь', 'Калуга',
        'Смоленск', 'Волжский', 'Якутск', 'Саранск', 'Череповец', 'Вологда', 'Севастополь',
        'Владикавказ', 'Грозный', 'Мурманск', 'Тамбов', 'Стерлитамак', 'Кострома', 'Петрозаводск',
        // Служебные слова
        'Отлично', 'Хорошо', 'Прекрасно', 'Замечательно', 'Спасибо', 'Пожалуйста',
        'Здравствуйте', 'Добрый', 'День', 'Вечер', 'Утро', 'Привет', 'Пока',
        'Большое', 'Огромное', 'Сердечное', 'Искреннее'
      ];
      
      let fioMatch;
      while ((fioMatch = fioPattern.exec(allText)) !== null) {
        const word1 = fioMatch[1];
        const word2 = fioMatch[2];
        const word3 = fioMatch[3];
        
        // Проверяем, что это не географическое название или служебное слово
        if (!excludeWords.includes(word1) && !excludeWords.includes(word2) && 
            (!word3 || !excludeWords.includes(word3))) {
          // Дополнительная проверка: исключаем если после идут слова "область", "край", "республика"
          const contextAfter = allText.substring(fioMatch.index + fioMatch[0].length, fioMatch.index + fioMatch[0].length + 50);
          if (!/(?:область|край|республика|округ|регион|город|г\.|улица|ул\.|проспект|пр\.)/i.test(contextAfter.substring(0, 20))) {
            if (word3) {
              profileData.lastName = word1.trim();
              profileData.firstName = word2.trim();
              profileData.middleName = word3.trim();
            } else if (word2) {
              profileData.firstName = word1.trim();
              profileData.lastName = word2.trim();
            }
            break; // Берем первое подходящее совпадение
          }
        }
      }
    }
  }

  // Extract date of birth - только если не извлечено из структурированных данных
  if (!profileData.dateOfBirth && !hasStructuredData) {
    let dateOfBirth: Date | null = null;

    // Сначала пробуем гибкий парсер
    const dateMatches = allText.match(
      /(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}|\d{1,2}\s+[а-яё]+\s+\d{4})/g
    );
    if (dateMatches) {
      for (const dateStr of dateMatches) {
        const parsed = parseDateFlexible(dateStr);
        if (parsed) {
          dateOfBirth = parsed;
          break; // Берем первый найденный
        }
      }
    }

    if (dateOfBirth) {
      profileData.dateOfBirth = dateOfBirth;
    }
  }

  // Extract phone - только если не извлечено из структурированных данных
  if (!profileData.phone && !hasStructuredData) {
    const phonePattern =
      /\+?7[\s-]?\(?(\d{3})\)?[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})/;
    const phoneMatch = allText.match(phonePattern);
    if (phoneMatch) {
      profileData.phone = allText.match(/\+?7[\s\-\(\)0-9]+/)?.[0] || "";
    }
  }

  // Extract address - только если не извлечено из структурированных данных
  if (!profileData.address && !hasStructuredData) {
    let addressCandidate: string | null = null;
    const addressLabelPattern = /(?:\*\*Адрес\*\*|Адрес)[^:\n]*[:\-–]\s*(.+)/i;
    const addressLabelMatch = allText.match(addressLabelPattern);
    if (addressLabelMatch) {
      addressCandidate = addressLabelMatch[1].split(/\n/)[0].trim();
    }

    if (!addressCandidate) {
      const addressPattern =
        /(ул\.|улица|пр\.|проспект|пл\.|площадь|переулок|пер\.|бульвар|бул\.|набережная|наб\.|г\.\s*[А-ЯЁ][а-яё]+|город\s+[А-ЯЁ][а-яё]+)/gi;
      const addressMatches = allText.match(addressPattern);
      if (addressMatches && addressMatches.length > 0) {
        addressCandidate = normalizeAddress(addressMatches[0]);
      }
    }

    if (addressCandidate) {
      addressCandidate = normalizeAddress(addressCandidate);

      try {
        console.log(`[profile-extraction] Validating address via DaData: ${addressCandidate}`);
        const validatedData = await validateAddressWithDaData(addressCandidate);
        if (validatedData) {
          profileData.address = validatedData.address;
          // Автоматически подставляем город из DaData
          if (validatedData.city) {
            profileData.preferredDiscountCity = validatedData.city;
          }
          console.log(`[profile-extraction] Address validated: ${validatedData.address}, city: ${validatedData.city}`);
        } else {
          profileData.address = addressCandidate;
          console.log(`[profile-extraction] Address not validated by DaData, using as-is: ${addressCandidate}`);
        }
      } catch (error) {
        console.error("[profile-extraction] Error validating address with DaData:", error);
        profileData.address = addressCandidate;
      }
    }
  }

  // Extract job title and profession - только если не извлечено из структурированных данных
  if ((!profileData.jobTitle || !profileData.profession) && !hasStructuredData) {
    // Используем userOnlyText чтобы не извлекать из текста бота
    const jobLabelPattern = /(?:\*\*Должность\*\*|Должность)[^:\n]*[:\-–]\s*(.+)/i;
    const professionLabelPattern = /(?:\*\*Профессия\*\*|Профессия)[^:\n]*[:\-–]\s*(.+)/i;

    const jobLabelMatch = userOnlyText.match(jobLabelPattern);
    if (jobLabelMatch && !profileData.jobTitle) {
      profileData.jobTitle = jobLabelMatch[1].split(/\n/)[0].trim();
    }

    const professionLabelMatch = userOnlyText.match(professionLabelPattern);
    if (professionLabelMatch && !profileData.profession) {
      profileData.profession = professionLabelMatch[1].split(/\n/)[0].trim();
    }

    if (!profileData.jobTitle || !profileData.profession) {
      const jobPattern =
        /(должност[а-яё]*|специалист[а-яё]*|инженер[а-яё]*|программист[а-яё]*|бухгалтер[а-яё]*|бухгалтер[а-яё]*|юрист[а-яё]*|менеджер[а-яё]*|директор[а-яё]*|учитель|врач|продавец|водитель).+?(?=\.|\n|,|$)/i;
      const jobMatch = userOnlyText.match(jobPattern);
      if (jobMatch) {
        const jobValue = jobMatch[0].trim();
        if (!profileData.jobTitle) profileData.jobTitle = jobValue;
        if (!profileData.profession) profileData.profession = jobValue;
      }
    }
  }

  // Extract education - только если не извлечено из структурированных данных
  if (!profileData.education && !hasStructuredData) {
    // Используем userOnlyText чтобы не извлекать из списков вариантов бота
    const educationLabelPattern = /(?:\*\*Образование\*\*|Образование)[^:\n]*[:\-–]\s*(.+)/i;
    const educationLabelMatch = userOnlyText.match(educationLabelPattern);

    if (educationLabelMatch) {
      profileData.education = educationLabelMatch[1].split(/\n/)[0].trim();
    }

    if (!profileData.education) {
      const educationPattern =
        /(высшее|среднее|начальное|бакалавриат|магистратура|специалитет|аспирантура|среднее профессиональное|начальное профессиональное).+?(?=\.|\n|$)/i;
      const educationMatch = userOnlyText.match(educationPattern);
      if (educationMatch) {
        profileData.education = educationMatch[0].trim();
      }
    }
  }

  // Extract organization name - только если не извлечено из структурированных данных
  if (!profileData.organizationName && !hasStructuredData) {
    const orgLabelPattern = /(?:\*\*Организация\*\*|Организация|работаю|работает)[^:\n]*[:\-–]\s*(.+)/i;
    const orgLabelMatch = allText.match(orgLabelPattern);
    if (orgLabelMatch) {
      profileData.organizationName = orgLabelMatch[1].split(/\n/)[0].trim();
    }

    // Также пытаемся найти название организации в контексте работы
    if (!profileData.organizationName) {
      const orgPattern = /(?:работаю|работает|организация|место работы)[\s:]+([А-ЯЁ][А-ЯЁа-яё\s"«»-]+(?:ООО|ЗАО|ОАО|ИП|ГБУЗ|ГБУ|МБУ|МУП|АО|ПАО|НКО|ОО|ППО|профсоюз)?)/i;
      const orgMatch = allText.match(orgPattern);
      if (orgMatch) {
        profileData.organizationName = orgMatch[1].trim();
      }
    }
  }

  // Финальная валидация извлеченных данных
  return validateExtractedProfile(profileData);
}

/**
 * Валидация извлеченных данных профиля
 */
function validateExtractedProfile(data: Record<string, any>): Record<string, any> {
  const validated: Record<string, any> = {};
  
  // Список запрещенных слов для ФИО
  const forbiddenWords = [
    'Отлично', 'Хорошо', 'Прекрасно', 'Замечательно', 'Спасибо', 'Пожалуйста',
    'Здравствуйте', 'Привет', 'Пока', 'Да', 'Нет', 'Может', 'Быть',
    'Республика', 'Область', 'Край', 'Округ', 'Регион', 'Город', 'Федерация', 'России', 'Российской',
    'Татарстан', 'Башкортостан', 'Москва', 'Петербург', 'Казань'
  ];
  
  // Валидация firstName
  if (data.firstName && typeof data.firstName === 'string') {
    const fn = data.firstName.trim();
    if (fn.length >= 2 && fn.length <= 50 && !forbiddenWords.includes(fn)) {
      validated.firstName = fn;
    } else {
      console.warn('[profile-extraction] Invalid firstName:', fn);
    }
  }
  
  // Валидация lastName
  if (data.lastName && typeof data.lastName === 'string') {
    const ln = data.lastName.trim();
    if (ln.length >= 2 && ln.length <= 50 && !forbiddenWords.includes(ln)) {
      validated.lastName = ln;
    } else {
      console.warn('[profile-extraction] Invalid lastName:', ln);
    }
  }
  
  // Валидация middleName
  if (data.middleName && typeof data.middleName === 'string') {
    const mn = data.middleName.trim();
    if (mn.length >= 2 && mn.length <= 50 && !forbiddenWords.includes(mn)) {
      validated.middleName = mn;
    } else {
      console.warn('[profile-extraction] Invalid middleName:', mn);
    }
  }
  
  // Валидация dateOfBirth
  if (data.dateOfBirth instanceof Date && !isNaN(data.dateOfBirth.getTime())) {
    const now = new Date();
    const age = now.getFullYear() - data.dateOfBirth.getFullYear();
    if (age >= 14 && age <= 100) {
      validated.dateOfBirth = data.dateOfBirth;
    } else {
      console.warn('[profile-extraction] Invalid dateOfBirth (age out of range):', data.dateOfBirth);
    }
  }
  
  // Валидация phone
  if (data.phone && typeof data.phone === 'string') {
    const phoneClean = data.phone.replace(/\D/g, '');
    if (phoneClean.length >= 10 && phoneClean.length <= 12) {
      validated.phone = data.phone;
    } else {
      console.warn('[profile-extraction] Invalid phone:', data.phone);
    }
  }
  
  // Валидация address
  if (data.address && typeof data.address === 'string') {
    const addr = data.address.trim();
    if (addr.length >= 5 && addr.length <= 500) {
      validated.address = addr;
    } else {
      console.warn('[profile-extraction] Invalid address:', addr);
    }
  }
  
  // Валидация region
  if (data.region && typeof data.region === 'string') {
    const reg = data.region.trim();
    if (reg.length >= 2 && reg.length <= 100) {
      validated.region = reg;
    }
  }
  
  // Валидация preferredDiscountCity
  if (data.preferredDiscountCity && typeof data.preferredDiscountCity === 'string') {
    const city = data.preferredDiscountCity.trim();
    if (city.length >= 2 && city.length <= 100) {
      validated.preferredDiscountCity = city;
    }
  }
  
  // Валидация jobTitle
  if (data.jobTitle && typeof data.jobTitle === 'string') {
    const jt = data.jobTitle.trim();
    if (jt.length >= 2 && jt.length <= 200) {
      validated.jobTitle = jt;
    }
  }
  
  // Валидация profession
  if (data.profession && typeof data.profession === 'string') {
    const prof = data.profession.trim();
    if (prof.length >= 2 && prof.length <= 200) {
      validated.profession = prof;
    }
  }
  
  // Валидация education
  if (data.education && typeof data.education === 'string') {
    const edu = data.education.trim();
    if (edu.length >= 2 && edu.length <= 300) {
      validated.education = edu;
    }
  }
  
  // Валидация organizationName
  if (data.organizationName && typeof data.organizationName === 'string') {
    const org = data.organizationName.trim();
    if (org.length >= 2 && org.length <= 500) {
      validated.organizationName = org;
    }
  }
  
  // ========== ВАЛИДАЦИЯ ДОПОЛНИТЕЛЬНЫХ ПОЛЕЙ ==========
  
  // Валидация employmentStatus
  if (data.employmentStatus && typeof data.employmentStatus === 'string') {
    const status = data.employmentStatus.toUpperCase();
    if (['WORK', 'STUDY', 'RETIREMENT'].includes(status)) {
      validated.employmentStatus = status;
    }
  }
  
  // Валидация maritalStatus
  if (data.maritalStatus && typeof data.maritalStatus === 'string') {
    const status = data.maritalStatus.toUpperCase();
    if (['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'CIVIL_MARRIAGE'].includes(status)) {
      validated.maritalStatus = status;
    }
  }
  
  // Валидация spouseInfo
  if (data.spouseInfo && typeof data.spouseInfo === 'string') {
    const info = data.spouseInfo.trim();
    if (info.length >= 2 && info.length <= 500) {
      validated.spouseInfo = info;
    }
  }
  
  // Валидация hasChildren
  if (data.hasChildren !== undefined && typeof data.hasChildren === 'boolean') {
    validated.hasChildren = data.hasChildren;
  }
  
  // Валидация childrenInfo
  if (data.childrenInfo && typeof data.childrenInfo === 'string') {
    const info = data.childrenInfo.trim();
    if (info.length >= 2 && info.length <= 1000) {
      validated.childrenInfo = info;
    }
  }
  
  // Валидация childrenBirthDates
  if (data.childrenBirthDates && typeof data.childrenBirthDates === 'string') {
    const dates = data.childrenBirthDates.trim();
    if (dates.length >= 2 && dates.length <= 2000) {
      validated.childrenBirthDates = dates;
    }
  }
  
  // Валидация hobbies
  if (data.hobbies && typeof data.hobbies === 'string') {
    const hobbies = data.hobbies.trim();
    if (hobbies.length >= 2 && hobbies.length <= 1000) {
      validated.hobbies = hobbies;
    }
  }
  
  // Валидация aboutMe
  if (data.aboutMe && typeof data.aboutMe === 'string') {
    const about = data.aboutMe.trim();
    if (about.length >= 2 && about.length <= 2000) {
      validated.aboutMe = about;
    }
  }
  
  // Валидация additionalInfo
  if (data.additionalInfo && typeof data.additionalInfo === 'string') {
    const info = data.additionalInfo.trim();
    if (info.length >= 2 && info.length <= 2000) {
      validated.additionalInfo = info;
    }
  }
  
  console.log('[profile-extraction] Validation result:', {
    input: Object.keys(data).length,
    validated: Object.keys(validated).length,
    rejected: Object.keys(data).filter(k => !validated[k]).join(', ')
  });
  
  return validated;
}

/**
 * Форматирует дату в формат ДД.ММ.ГГГГ для отображения
 */
export function formatDateForDisplay(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Проверяет полноту профиля
 */
export function isProfileComplete(user: any): boolean {
  return (
    !!user?.firstName &&
    !!user?.lastName &&
    !!user?.dateOfBirth &&
    !!user?.phone &&
    !!user?.address &&
    !!user?.jobTitle &&
    !!user?.profession &&
    !!user?.education
  );
}

