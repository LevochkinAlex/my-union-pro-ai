import { validateAddressWithDaData } from "./dadata";

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
  // Обычно это сообщение со словами "Спасибо за информацию" или "Мы собрали"
  const confirmationMessage = botMessages
    .reverse()
    .find(msg => 
      msg.content.includes('собрали') || 
      msg.content.includes('подтверд') ||
      msg.content.includes('данные готовы')
    );
  
  if (!confirmationMessage) {
    return extracted;
  }
  
  const text = confirmationMessage.content;
  
  // ФИО: "**ФИО**: Иванов Иван Иванович" или "1. **ФИО**: Иванов Иван Иванович"
  const fioPattern = /\*\*ФИО\*\*[:\s]+([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/;
  const fioMatch = text.match(fioPattern);
  if (fioMatch) {
    extracted.lastName = fioMatch[1].trim();
    extracted.firstName = fioMatch[2].trim();
    if (fioMatch[3]) {
      extracted.middleName = fioMatch[3].trim();
    }
  }
  
  // Дата рождения: "**Дата рождения**: 12.02.1970"
  const dobPattern = /\*\*Дата рождения\*\*[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/;
  const dobMatch = text.match(dobPattern);
  if (dobMatch) {
    const [day, month, year] = dobMatch[1].split('.').map(Number);
    extracted.dateOfBirth = new Date(year, month - 1, day);
  }
  
  // Адрес: "**Адрес**: Производственная 8к2, Москва"
  const addressPattern = /\*\*Адрес\*\*[:\s]+([^\n]+)/;
  const addressMatch = text.match(addressPattern);
  if (addressMatch) {
    extracted.address = addressMatch[1].trim();
  }
  
  // Телефон: "**Телефон**: +7 (963) 977-12-86"
  const phonePattern = /\*\*Телефон\*\*[:\s]+(\+7[^\n]+)/;
  const phoneMatch = text.match(phonePattern);
  if (phoneMatch) {
    extracted.phone = phoneMatch[1].trim();
  }
  
  // Должность: "**Должность**: Зампред"
  const jobPattern = /\*\*Должность\*\*[:\s]+([^\n]+)/;
  const jobMatch = text.match(jobPattern);
  if (jobMatch) {
    extracted.jobTitle = jobMatch[1].trim();
  }
  
  // Профессия: "**Профессия**: Сторож высшего разряда"
  const professionPattern = /\*\*Профессия\*\*[:\s]+([^\n]+)/;
  const professionMatch = text.match(professionPattern);
  if (professionMatch) {
    extracted.profession = professionMatch[1].trim();
  }
  
  // Образование: "**Образование**: Основное общее (9 классов)"
  const educationPattern = /\*\*Образование\*\*[:\s]+([^\n]+)/;
  const educationMatch = text.match(educationPattern);
  if (educationMatch) {
    extracted.education = educationMatch[1].trim();
  }
  
  // Организация: "**Организация**: МООП РЗ РФ"
  const orgPattern = /\*\*Организация\*\*[:\s]+([^\n]+)/;
  const orgMatch = text.match(orgPattern);
  if (orgMatch) {
    extracted.organizationName = orgMatch[1].trim();
  }
  
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
  
  if (Object.keys(structuredData).length > 0) {
    console.log('[profile-extraction] Found structured data from bot:', structuredData);
    Object.assign(profileData, structuredData);
  }

  // Join all text for analysis (fallback если структурированные данные не найдены)
  const allText = messages
    .map((msg) => msg.content)
    .join("\n");

  // Extract region (регион России)
  const regionPattern = /(?:регион|область|край|республика)[\s:]+([А-ЯЁ][а-яё\s-]+(?:область|край|республика|автономный округ)?)/i;
  const regionMatch = allText.match(regionPattern);
  if (regionMatch) {
    profileData.region = regionMatch[1].trim();
  }

  // Extract preferred discount city (город для скидок)
  // Ищем упоминания городов: "из Казани", "живу в Москве", "г. Санкт-Петербург" и т.д.
  const cityPatterns = [
    /(?:из|живу в|нахожусь в|город)\s+г?\.?\s*([А-ЯЁ][а-яё\-]+)/i,
    /г\.?\s*([А-ЯЁ][а-яё\-]+)/i,
    /город\s+([А-ЯЁ][а-яё\-]+)/i,
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
  
  // Extract occupation (род занятий)
  const occupationPatterns = [
    /(?:занимаюсь|занимаетесь|работаю|профессия|род занятий)[:\s]+([^\n.!?]{5,100})/i,
    /(?:я|по профессии)\s+([а-яё\s,]{3,50})(?:\.|,|!|\n)/i,
  ];
  for (const pattern of occupationPatterns) {
    const match = allText.match(pattern);
    if (match && match[1]) {
      profileData.occupation = match[1].trim();
      break;
    }
  }

  // Extract aboutMe (о себе)
  const aboutMePatterns = [
    /(?:о себе|о вас|вдохновляет|характер)[:\s]+([^\n]{10,500})/i,
    /(?:я|меня)\s+(?:вдохновляет|интересует|увлекает)[^\n]{10,300}/i,
  ];
  for (const pattern of aboutMePatterns) {
    const match = allText.match(pattern);
    if (match) {
      const text = match[0] || match[1];
      if (text && text.length > 10) {
        profileData.aboutMe = text.trim();
        break;
      }
    }
  }

  // Extract hobbies (хобби и увлечения)
  const hobbiesPatterns = [
    /(?:хобби|увлечения|увлекаюсь|интересы)[:\s]+([^\n.!?]{5,300})/i,
  ];
  for (const pattern of hobbiesPatterns) {
    const match = allText.match(pattern);
    if (match && match[1]) {
      profileData.hobbies = match[1].trim();
      break;
    }
  }

  // Extract marital status (семейное положение)
  const maritalPatterns = [
    /(?:семейное положение|замужем|женат|холост|в браке|не замужем)[:\s]*([^\n.!?]{3,50})/i,
  ];
  for (const pattern of maritalPatterns) {
    const match = allText.match(pattern);
    if (match) {
      const status = (match[1] || match[0]).trim().toLowerCase();
      if (status.includes('замужем') || status.includes('женат') || status.includes('в браке')) {
        profileData.maritalStatus = 'MARRIED';
      } else if (status.includes('холост') || status.includes('не замужем') || status.includes('не женат')) {
        profileData.maritalStatus = 'SINGLE';
      } else if (status.includes('развод')) {
        profileData.maritalStatus = 'DIVORCED';
      } else if (status.includes('вдов')) {
        profileData.maritalStatus = 'WIDOWED';
      }
      break;
    }
  }

  // Extract spouse info (информация о супруге)
  const spousePatterns = [
    /(?:супруг|супруга|муж|жена|партнер)[:\s]+([^\n]{10,200})/i,
  ];
  for (const pattern of spousePatterns) {
    const match = allText.match(pattern);
    if (match && match[1]) {
      profileData.spouseInfo = match[1].trim();
      break;
    }
  }

  // Extract children info (информация о детях)
  if (allText.match(/(?:есть дети|у меня есть|дети|ребенок|сын|дочь)/i)) {
    profileData.hasChildren = true;
    
    const childrenPatterns = [
      /(?:дети|ребенок|сын|дочь)[:\s]+([^\n]{10,300})/i,
      /(?:детей|ребенка)\s+(?:зовут|имена|возраст)[:\s]*([^\n]{10,200})/i,
    ];
    for (const pattern of childrenPatterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        profileData.childrenInfo = match[1].trim();
        break;
      }
    }
  } else if (allText.match(/(?:нет детей|без детей|детей нет)/i)) {
    profileData.hasChildren = false;
  }

  // Extract additional info (дополнительная информация)
  const additionalPatterns = [
    /(?:дополнительная информация|еще|также|кроме того)[:\s]+([^\n]{10,500})/i,
  ];
  for (const pattern of additionalPatterns) {
    const match = allText.match(pattern);
    if (match && match[1]) {
      profileData.additionalInfo = match[1].trim();
      break;
    }
  }

  // Extract name patterns (ФИО) - только если не извлечено из структурированных данных
  if (!profileData.firstName || !profileData.lastName) {
    // Сначала ищем по явным меткам
    const fioLabelPattern = /(?:\*\*(?:ФИО|Фамилия|Имя)\*\*|ФИО|Фамилия\s+Имя\s+Отчество)[^:\n]*[:\-–]\s*([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/i;
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
      const fioPattern = /([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/g;
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

  // Extract date of birth - попытаемся в разных форматах
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

  // Extract phone
  const phonePattern =
    /\+?7[\s-]?\(?(\d{3})\)?[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})/;
  const phoneMatch = allText.match(phonePattern);
  if (phoneMatch) {
    profileData.phone = allText.match(/\+?7[\s\-\(\)0-9]+/)?.[0] || "";
  }

  // Extract address - сначала ищем по явной метке "Адрес"
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
      const validatedAddress = await validateAddressWithDaData(addressCandidate);
      if (validatedAddress) {
        profileData.address = validatedAddress;
        console.log(`[profile-extraction] Address validated: ${validatedAddress}`);
      } else {
        profileData.address = addressCandidate;
        console.log(`[profile-extraction] Address not validated by DaData, using as-is: ${addressCandidate}`);
      }
    } catch (error) {
      console.error("[profile-extraction] Error validating address with DaData:", error);
      profileData.address = addressCandidate;
    }
  }

  // Extract job title and profession
  const jobLabelPattern = /(?:\*\*Должность\*\*|Должность)[^:\n]*[:\-–]\s*(.+)/i;
  const professionLabelPattern = /(?:\*\*Профессия\*\*|Профессия)[^:\n]*[:\-–]\s*(.+)/i;

  const jobLabelMatch = allText.match(jobLabelPattern);
  if (jobLabelMatch) {
    profileData.jobTitle = jobLabelMatch[1].split(/\n/)[0].trim();
  }

  const professionLabelMatch = allText.match(professionLabelPattern);
  if (professionLabelMatch) {
    profileData.profession = professionLabelMatch[1].split(/\n/)[0].trim();
  }

  if (!profileData.jobTitle || !profileData.profession) {
    const jobPattern =
      /(должност[а-яё]*|специалист[а-яё]*|инженер[а-яё]*|программист[а-яё]*|бухгалтер[а-яё]*|юрист[а-яё]*|менеджер[а-яё]*|директор[а-яё]*|учитель|врач|продавец|водитель).+?(?=\.|\n|,|$)/i;
    const jobMatch = allText.match(jobPattern);
    if (jobMatch) {
      const jobValue = jobMatch[0].trim();
      if (!profileData.jobTitle) profileData.jobTitle = jobValue;
      if (!profileData.profession) profileData.profession = jobValue;
    }
  }

  // Extract education
  const educationLabelPattern = /(?:\*\*Образование\*\*|Образование)[^:\n]*[:\-–]\s*(.+)/i;
  const educationLabelMatch = allText.match(educationLabelPattern);

  if (educationLabelMatch) {
    profileData.education = educationLabelMatch[1].split(/\n/)[0].trim();
  }

  if (!profileData.education) {
    const educationPattern =
      /(высшее|среднее|начальное|бакалавриат|магистратура|специалитет|аспирантура|среднее профессиональное|начальное профессиональное).+?(?=\.|\n|$)/i;
    const educationMatch = allText.match(educationPattern);
    if (educationMatch) {
      profileData.education = educationMatch[0].trim();
    }
  }

  // Extract organization name
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

