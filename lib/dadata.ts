/**
 * DaData API Integration
 * For address validation and standardization
 */

const DADATA_CLEAN_ADDRESS_URL = "https://cleaner.dadata.ru/api/v1/clean/address";
const DADATA_SUGGEST_ADDRESS_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";
const DADATA_CLEAN_NAME_URL = "https://cleaner.dadata.ru/api/v1/clean/name";

function getDaDataToken(): string {
  return process.env.DADATA_API_KEY || "";
}

function getDaDataSecret(): string {
  return process.env.DADATA_SECRET_KEY || "";
}

/**
 * Интерфейс для ответа DaData
 */
interface DaDataResponse {
  input_id?: number;
  result_exts?: {
    unparsed_parts?: string;
  };
  result?: string;
  postal_code?: string;
  country?: string;
  region_fias_id?: string;
  region_kladr_id?: string;
  region_with_type?: string;
  area_fias_id?: string;
  area_kladr_id?: string;
  area_with_type?: string;
  city_fias_id?: string;
  city_kladr_id?: string;
  city_with_type?: string;
  city_district_fias_id?: string;
  city_district_kladr_id?: string;
  city_district_with_type?: string;
  settlement_fias_id?: string;
  settlement_kladr_id?: string;
  settlement_with_type?: string;
  street_fias_id?: string;
  street_kladr_id?: string;
  street_with_type?: string;
  house?: string;
  house_fias_id?: string;
  house_kladr_id?: string;
  block?: string;
  flat?: string;
  flat_fias_id?: string;
  flat_type?: string;
  flat_cadnum?: string;
  qc?: string;
}

/**
 * Результат валидации адреса
 */
export interface ValidatedAddress {
  address: string;
  city: string | null;
}

/**
 * Результат валидации ФИО
 */
export interface ValidatedName {
  lastName: string;
  firstName: string;
  middleName?: string;
  validated: boolean; // true если DaData успешно распознал ФИО
}

/**
 * Валидирует и стандартизирует адрес через DaData
 * Возвращает полный корректный адрес и город или null если не удалось распарсить
 */
export async function validateAddressWithDaData(address: string): Promise<ValidatedAddress | null> {
  const token = getDaDataToken();
  
  if (!address || !token) {
    console.warn("[dadata] No address or API token provided");
    return null;
  }

  try {
    console.log(`[dadata] Validating address: ${address}`);

    // Используем Suggestions API (более доступный)
    const response = await fetch(DADATA_SUGGEST_ADDRESS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({ query: address, count: 1 }),
    });

    if (!response.ok) {
      console.warn(`[dadata] API error: ${response.status}`);
      return null;
    }

    const result = await response.json();
    
    if (!result.suggestions || result.suggestions.length === 0) {
      console.warn(`[dadata] Address not found: ${address}`);
      return null;
    }

    const data = result.suggestions[0].data;

    // Проверяем что адрес найден
    if (!data || data.qc === "4") {
      console.warn(`[dadata] Address not found or invalid: ${address}`);
      return null;
    }

    // Собираем полный адрес из компонентов
    const addressParts: string[] = [];

    if (data.region_with_type) addressParts.push(data.region_with_type);
    if (data.area_with_type) addressParts.push(data.area_with_type);
    if (data.city_with_type) addressParts.push(data.city_with_type);
    if (data.city_district_with_type) addressParts.push(data.city_district_with_type);
    if (data.settlement_with_type) addressParts.push(data.settlement_with_type);
    if (data.street_with_type) addressParts.push(data.street_with_type);
    if (data.house) addressParts.push(`д. ${data.house}`);
    if (data.block) addressParts.push(`корп. ${data.block}`);
    if (data.flat) addressParts.push(`кв. ${data.flat}`);

    const fullAddress = addressParts.join(", ");

    // Извлекаем город (приоритет: city_with_type, затем settlement_with_type)
    let city: string | null = null;
    if (data.city_with_type) {
      // Убираем тип (г, г., город, гор. и т.д.), оставляем только название города
      city = data.city_with_type
        .replace(/^(г\s+|г\.|город\s+|гор\.\s*)/i, "")
        .trim();
    } else if (data.settlement_with_type) {
      // Если города нет, берем населенный пункт
      city = data.settlement_with_type
        .replace(/^(п\s+|п\.|пос\.\s*|село\s+|с\.\s*|деревня\s+|д\.\s*)/i, "")
        .trim();
    }

    console.log(`[dadata] Address validated successfully: ${fullAddress}, city: ${city}`);
    return {
      address: fullAddress,
      city
    };
  } catch (error) {
    console.error("[dadata] Error validating address:", error);
    return null;
  }
}

/**
 * Формирует адрес в читаемом виде из компонентов
 */
export function formatAddressFromComponents(data: DaDataResponse): string {
  const parts: string[] = [];

  // Собираем адрес по иерархии
  if (data.region_with_type) parts.push(data.region_with_type);
  if (data.city_with_type) parts.push(data.city_with_type);
  if (data.street_with_type) parts.push(data.street_with_type);
  if (data.house) parts.push(`д. ${data.house}`);
  if (data.block) parts.push(`корп. ${data.block}`);
  if (data.flat) parts.push(`кв. ${data.flat}`);

  return parts.join(", ");
}

/**
 * Интерфейс для ответа DaData по ФИО
 */
interface DaDataNameResponse {
  source?: string;
  result?: string;
  result_genitive?: string; // Родительный падеж (кого? чего?)
  result_dative?: string;    // Дательный падеж (кому? чему?)
  result_ablative?: string;  // Творительный падеж (кем? чем?)
  surname?: string;
  name?: string;
  patronymic?: string;
  gender?: string;
  qc?: string;
}

/**
 * Валидация и нормализация ФИО через DaData
 * Проверяет корректность написания и возвращает нормализованное ФИО
 */
export async function validateNameWithDaData(fullName: string): Promise<ValidatedName | null> {
  const token = getDaDataToken();
  const secret = getDaDataSecret();

  if (!token || !secret) {
    console.warn("[dadata] DaData credentials not configured, skipping name validation");
    
    // Fallback: простой парсинг ФИО
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        lastName: parts[0],
        firstName: parts[1],
        middleName: parts[2] || undefined,
        validated: false,
      };
    }
    return null;
  }

  try {
    const response = await fetch(DADATA_CLEAN_NAME_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
        "X-Secret": secret,
      },
      body: JSON.stringify([fullName]),
    });

    if (!response.ok) {
      console.error("[dadata] Name validation failed:", response.statusText);
      // Fallback
      const parts = fullName.trim().split(/\s+/);
      if (parts.length >= 2) {
        return {
          lastName: parts[0],
          firstName: parts[1],
          middleName: parts[2] || undefined,
          validated: false,
        };
      }
      return null;
    }

    const data: DaDataNameResponse[] = await response.json();
    const nameData = data[0];

    if (nameData && nameData.surname && nameData.name) {
      console.log("[dadata] ✅ Name validated:", {
        surname: nameData.surname,
        name: nameData.name,
        patronymic: nameData.patronymic,
        gender: nameData.gender,
        qc: nameData.qc,
      });

      return {
        lastName: nameData.surname,
        firstName: nameData.name,
        middleName: nameData.patronymic || undefined,
        validated: true,
      };
    }

    // Если DaData не смог распознать - используем fallback
    console.warn("[dadata] ⚠️ Name not recognized by DaData, using fallback");
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        lastName: parts[0],
        firstName: parts[1],
        middleName: parts[2] || undefined,
        validated: false,
      };
    }

    return null;
  } catch (error) {
    console.error("[dadata] Name validation error:", error);
    // Fallback
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        lastName: parts[0],
        firstName: parts[1],
        middleName: parts[2] || undefined,
        validated: false,
      };
    }
    return null;
  }
}

/**
 * Склоняет ФИО в родительный падеж через DaData
 * @param lastName Фамилия
 * @param firstName Имя
 * @param middleName Отчество
 * @returns ФИО в родительном падеже
 */
export async function declineNameToGenitive(
  lastName: string,
  firstName: string,
  middleName?: string | null
): Promise<string> {
  const token = getDaDataToken();
  const secret = getDaDataSecret();
  
  const fullName = `${lastName} ${firstName}${middleName ? ` ${middleName}` : ""}`.trim();
  
  if (!token || !secret) {
    console.warn("[dadata] No API token or secret provided, using fallback declension");
    return fallbackDeclension(lastName, firstName, middleName);
  }

  try {
    console.log(`[dadata] Declining name to genitive: ${fullName}`);

    const response = await fetch(DADATA_CLEAN_NAME_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
        "X-Secret": secret,
      },
      body: JSON.stringify([fullName]),
    });

    if (!response.ok) {
      console.warn(`[dadata] Name API error: ${response.status}, using fallback`);
      return fallbackDeclension(lastName, firstName, middleName);
    }

    const data: DaDataNameResponse[] = await response.json();
    
    if (data.length > 0 && data[0].result_genitive) {
      console.log(`[dadata] Name declined successfully: ${data[0].result_genitive}`);
      return data[0].result_genitive;
    } else {
      console.warn(`[dadata] Could not decline name, using fallback`);
      return fallbackDeclension(lastName, firstName, middleName);
    }
  } catch (error) {
    console.error("[dadata] Error declining name:", error);
    return fallbackDeclension(lastName, firstName, middleName);
  }
}

/**
 * Упрощенное склонение ФИО (fallback если DaData недоступен)
 */
function fallbackDeclension(
  lastName: string,
  firstName: string,
  middleName?: string | null
): string {
  // Фамилия
  let lastNameGenitive = lastName;
  if (lastName.endsWith("ов") || lastName.endsWith("ев") || lastName.endsWith("ин")) {
    lastNameGenitive = lastName + "а";
  } else if (lastName.endsWith("ский") || lastName.endsWith("ской") || lastName.endsWith("цкий")) {
    lastNameGenitive = lastName.slice(0, -2) + "ого";
  } else if (lastName.endsWith("о") || lastName.endsWith("ко") || lastName.endsWith("енко")) {
    // Украинские фамилии не склоняются
    lastNameGenitive = lastName;
  } else if (lastName.endsWith("а") || lastName.endsWith("я")) {
    lastNameGenitive = lastName.slice(0, -1) + "ой";
  }
  
  // Имя
  let firstNameGenitive = firstName;
  if (firstName.endsWith("а") || firstName.endsWith("я")) {
    firstNameGenitive = firstName.slice(0, -1) + (firstName.endsWith("ия") ? "и" : "ы");
  } else if (firstName.endsWith("й")) {
    firstNameGenitive = firstName.slice(0, -1) + "я";
  } else {
    firstNameGenitive = firstName + "а";
  }
  
  // Отчество
  let middleNameGenitive = "";
  if (middleName) {
    if (middleName.endsWith("ич")) {
      middleNameGenitive = middleName + "а";
    } else if (middleName.endsWith("на")) {
      middleNameGenitive = middleName.slice(0, -1) + "ы";
    } else {
      middleNameGenitive = middleName;
    }
  }
  
  return `${lastNameGenitive} ${firstNameGenitive}${middleNameGenitive ? ` ${middleNameGenitive}` : ""}`.trim();
}

