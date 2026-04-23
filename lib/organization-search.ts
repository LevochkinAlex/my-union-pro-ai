/**
 * Поиск организации в локальной базе (для чата и подсказок).
 */

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
