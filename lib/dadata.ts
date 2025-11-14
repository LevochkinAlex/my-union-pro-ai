/**
 * DaData API Integration
 * For address validation and standardization
 */

const DADATA_API_URL = "https://cleaner.dadata.ru/api/v1/clean/address";

function getDaDataToken(): string {
  return process.env.DADATA_API_KEY || "";
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
 * Валидирует и стандартизирует адрес через DaData
 * Возвращает полный корректный адрес или null если не удалось распарсить
 */
export async function validateAddressWithDaData(address: string): Promise<string | null> {
  const token = getDaDataToken();
  
  if (!address || !token) {
    console.warn("[dadata] No address or API token provided");
    return null;
  }

  try {
    console.log(`[dadata] Validating address: ${address}`);

    const response = await fetch(DADATA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({ query: address }),
    });

    if (!response.ok) {
      console.warn(`[dadata] API error: ${response.status}`);
      return null;
    }

    const data: DaDataResponse = await response.json();

    // Проверяем что адрес был распарсен успешно
    if (!data.result || data.qc === "4") {
      // qc = 4 означает что адрес не найден
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

    console.log(`[dadata] Address validated successfully: ${fullAddress}`);
    return fullAddress;
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

