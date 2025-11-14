/**
 * Поиск организации по Минюсту РФ
 * Использует API Минюста для поиска организаций
 */

interface MinjustOrganization {
  name: string;
  inn?: string;
  ogrn?: string;
  address?: string;
  status?: string;
}

/**
 * Поиск организации в базе данных по названию
 */
export async function searchOrganizationInDatabase(
  organizationName: string,
  region?: string
): Promise<{ id: string; name: string } | null> {
  const { prisma } = await import("./prisma");
  
  // Поиск по точному совпадению названия
  let organization = await prisma.organization.findFirst({
    where: {
      name: {
        contains: organizationName,
        mode: "insensitive",
      },
      isActive: true,
    },
  });

  // Если не найдено, попробуем поиск по части названия
  if (!organization) {
    const words = organizationName.split(/\s+/).filter(w => w.length > 3);
    if (words.length > 0) {
      organization = await prisma.organization.findFirst({
        where: {
          OR: words.map(word => ({
            name: {
              contains: word,
              mode: "insensitive",
            },
          })),
          isActive: true,
        },
      });
    }
  }

  return organization ? { id: organization.id, name: organization.name } : null;
}

/**
 * Поиск организации через DaData API (который использует данные ЕГРЮЛ/Минюста РФ)
 * DaData предоставляет доступ к реестру юридических лиц, включая некоммерческие организации
 */
export async function searchOrganizationInMinjust(
  organizationName: string,
  region?: string
): Promise<MinjustOrganization | null> {
  const { getDaDataConfig } = await import("./settings");
  
  try {
    const dadataConfig = await getDaDataConfig();
    const apiKey = dadataConfig.apiKey;
    
    if (!apiKey) {
      console.warn("[organization-search] DaData API key not configured");
      return null;
    }

    console.log(`[organization-search] Searching organization in DaData/Minjust: ${organizationName}, region: ${region || "не указан"}`);

    // Используем DaData API для поиска организаций (он использует данные ЕГРЮЛ)
    const response = await fetch(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({
          query: organizationName,
          count: 5,
          ...(region && {
            locations: [
              {
                region: region,
              },
            ],
          }),
          status: ["ACTIVE"], // Только активные организации
        }),
      }
    );

    if (!response.ok) {
      console.warn(`[organization-search] DaData API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const suggestions = data.suggestions || [];

    if (suggestions.length === 0) {
      console.log(`[organization-search] Organization not found in DaData: ${organizationName}`);
      return null;
    }

    // Берем первую найденную организацию
    const org = suggestions[0];
    const orgData = org.data || {};

    // Проверяем, что это некоммерческая организация (НКО) или профсоюз
    const orgType = orgData.type || "";
    const isNKO = orgType === "NONPROFIT" || 
                  orgData.opf?.full?.toLowerCase().includes("некоммерческая") ||
                  orgData.opf?.full?.toLowerCase().includes("профсоюз") ||
                  orgData.name?.full?.toLowerCase().includes("профсоюз");

    if (!isNKO) {
      console.log(`[organization-search] Found organization but not NKO: ${orgData.name?.full}`);
      // Все равно возвращаем, так как может быть профсоюз
    }

    const result: MinjustOrganization = {
      name: orgData.name?.full || org.value || organizationName,
      inn: orgData.inn,
      ogrn: orgData.ogrn,
      address: orgData.address?.value,
      status: orgData.state?.status,
    };

    console.log(`[organization-search] Organization found in DaData/Minjust: ${result.name}`);
    return result;
  } catch (error) {
    console.error("[organization-search] Error searching in Minjust/DaData:", error);
    return null;
  }
}

/**
 * Нормализация названия организации
 */
export function normalizeOrganizationName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/['']/g, "'");
}

/**
 * Поиск организации: сначала в базе данных, затем в Минюсте
 */
export async function findOrganization(
  organizationName: string,
  region?: string
): Promise<{ id?: string; name: string; foundInDatabase: boolean } | null> {
  const normalizedName = normalizeOrganizationName(organizationName);
  
  // Сначала ищем в базе данных
  const dbOrg = await searchOrganizationInDatabase(normalizedName, region);
  if (dbOrg) {
    return {
      id: dbOrg.id,
      name: dbOrg.name,
      foundInDatabase: true,
    };
  }

  // Если не найдено в базе, ищем в Минюсте
  const minjustOrg = await searchOrganizationInMinjust(normalizedName, region);
  if (minjustOrg) {
    return {
      name: minjustOrg.name,
      foundInDatabase: false,
    };
  }

  return null;
}

