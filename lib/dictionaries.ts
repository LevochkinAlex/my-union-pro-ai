import { prisma } from "@/lib/prisma";

/**
 * Ищет наиболее подходящую должность в справочнике
 */
export async function findJobTitle(query: string): Promise<string | null> {
  if (!query || query.length < 3) return null;

  // 1. Точное совпадение (case insensitive)
  const exact = await prisma.jobTitle.findFirst({
    where: {
      name: {
        equals: query,
        mode: "insensitive",
      },
    },
  });

  if (exact) return exact.name;

  // 2. Поиск по частичному совпадению
  // Например: "зампред" -> "Заместитель председателя" (сложно без полнотекстового поиска)
  // Но "заместитель" -> "Заместитель главного врача" сработает
  
  // Для сокращений типа "зампред" лучше использовать словарь синонимов,
  // но пока попробуем простой поиск
  
  const partial = await prisma.jobTitle.findFirst({
    where: {
      name: {
        contains: query,
        mode: "insensitive",
      },
    },
  });

  if (partial) return partial.name;

  return null;
}

/**
 * Ищет наиболее подходящую профессию в справочнике
 */
export async function findProfession(query: string): Promise<string | null> {
  if (!query || query.length < 3) return null;

  const exact = await prisma.profession.findFirst({
    where: {
      name: {
        equals: query,
        mode: "insensitive",
      },
    },
  });

  if (exact) return exact.name;

  const partial = await prisma.profession.findFirst({
    where: {
      name: {
        contains: query,
        mode: "insensitive",
      },
    },
  });

  if (partial) return partial.name;

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

