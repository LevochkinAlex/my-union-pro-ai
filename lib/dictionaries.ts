import { prisma } from "@/lib/prisma";

/**
 * Ищет наиболее подходящую должность в справочнике
 */
export async function findJobTitle(query: string): Promise<string | null> {
  if (!query || query.length < 3) return null;

  // Нормализуем запрос: убираем лишние пробелы
  const normalizedQuery = query.trim();

  // 1. Точное совпадение (case insensitive)
  const exact = await prisma.jobTitle.findFirst({
    where: {
      name: {
        equals: normalizedQuery,
        mode: "insensitive",
      },
    },
  });

  if (exact) return exact.name;

  // 2. Попробуем заменить пробелы на дефисы и наоборот
  const queryWithDash = normalizedQuery.replace(/\s+/g, "-");
  const queryWithSpace = normalizedQuery.replace(/-/g, " ");

  for (const variant of [queryWithDash, queryWithSpace]) {
    if (variant !== normalizedQuery) {
      const exactVariant = await prisma.jobTitle.findFirst({
        where: {
          name: {
            equals: variant,
            mode: "insensitive",
          },
        },
      });
      if (exactVariant) return exactVariant.name;
    }
  }

  // 3. Поиск по частичному совпадению (включая варианты с дефисами/пробелами)
  for (const variant of [normalizedQuery, queryWithDash, queryWithSpace]) {
    const partial = await prisma.jobTitle.findFirst({
      where: {
        name: {
          contains: variant,
          mode: "insensitive",
        },
      },
    });
    if (partial) return partial.name;
  }

  return null;
}

/**
 * Ищет наиболее подходящую профессию в справочнике
 */
export async function findProfession(query: string): Promise<string | null> {
  if (!query || query.length < 3) return null;

  // Нормализуем запрос: убираем лишние пробелы
  const normalizedQuery = query.trim();

  // 1. Точное совпадение (case insensitive)
  const exact = await prisma.profession.findFirst({
    where: {
      name: {
        equals: normalizedQuery,
        mode: "insensitive",
      },
    },
  });

  if (exact) return exact.name;

  // 2. Попробуем заменить пробелы на дефисы и наоборот
  const queryWithDash = normalizedQuery.replace(/\s+/g, "-");
  const queryWithSpace = normalizedQuery.replace(/-/g, " ");

  for (const variant of [queryWithDash, queryWithSpace]) {
    if (variant !== normalizedQuery) {
      const exactVariant = await prisma.profession.findFirst({
        where: {
          name: {
            equals: variant,
            mode: "insensitive",
          },
        },
      });
      if (exactVariant) return exactVariant.name;
    }
  }

  // 3. Поиск по частичному совпадению (включая варианты с дефисами/пробелами)
  for (const variant of [normalizedQuery, queryWithDash, queryWithSpace]) {
    const partial = await prisma.profession.findFirst({
      where: {
        name: {
          contains: variant,
          mode: "insensitive",
        },
      },
    });
    if (partial) return partial.name;
  }

  return null;
}

/**
 * Получает список всех профессий (для API)
 */
export async function getProfessions() {
  return await prisma.profession.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * Получает список всех должностей (для API)
 */
export async function getJobTitles() {
  return await prisma.jobTitle.findMany({
    orderBy: { name: "asc" },
  });
}

