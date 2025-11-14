import { validateAddressWithDaData } from "./dadata";

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

  // Join all text for analysis
  const allText = messages
    .map((msg) => msg.content)
    .join("\n");

  // Extract region (регион России)
  const regionPattern = /(?:регион|область|край|республика)[\s:]+([А-ЯЁ][а-яё\s-]+(?:область|край|республика|автономный округ)?)/i;
  const regionMatch = allText.match(regionPattern);
  if (regionMatch) {
    profileData.region = regionMatch[1].trim();
  }

  // Extract name patterns (ФИО)
  const fioPattern = /([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?/;
  const fioMatch = allText.match(fioPattern);
  if (fioMatch) {
    if (fioMatch[3]) {
      profileData.lastName = fioMatch[1].trim();
      profileData.firstName = fioMatch[2].trim();
      profileData.middleName = fioMatch[3].trim();
    } else if (fioMatch[2]) {
      profileData.firstName = fioMatch[1].trim();
      profileData.lastName = fioMatch[2].trim();
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

  return profileData;
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

