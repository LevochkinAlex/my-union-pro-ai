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
 * Поиск организации через API Минюста РФ
 * Примечание: Для реального использования нужен API ключ Минюста
 */
export async function searchOrganizationInMinjust(
  organizationName: string,
  region?: string
): Promise<MinjustOrganization | null> {
  // TODO: Реализовать поиск через API Минюста РФ
  // Пример URL: https://minjust.gov.ru/api/organizations/search
  // Требуется API ключ
  
  try {
    // Пока возвращаем null - нужно настроить API ключ
    // const response = await fetch(`https://minjust.gov.ru/api/organizations/search?name=${encodeURIComponent(organizationName)}&region=${region || ""}`, {
    //   headers: {
    //     "Authorization": `Bearer ${process.env.MINJUST_API_KEY}`,
    //   },
    // });
    // 
    // if (response.ok) {
    //   const data = await response.json();
    //   return data.organizations?.[0] || null;
    // }
    
    return null;
  } catch (error) {
    console.error("[organization-search] Error searching in Minjust:", error);
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

