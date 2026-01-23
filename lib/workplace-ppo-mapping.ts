/**
 * Справочник связи мест работы с ППО
 * Используется для автоматического определения ППО по месту работы (название + ИНН)
 */

import { prisma } from "@/lib/prisma";

export interface WorkplacePPOMapping {
  id: string;
  workplaceName: string;
  workplaceInn: string;
  ppoOrganizationId: string;
  ppoOrganization: {
    id: string;
    name: string;
    type: string;
    chairmanName: string | null;
    chairmanJobTitle: string | null;
  };
  source: string | null;
  verified: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Найти ППО по месту работы (название + ИНН)
 */
export async function findPPOByWorkplace(
  workplaceName: string,
  workplaceInn: string
): Promise<{
  ppoOrganizationId: string;
  ppoOrganization: {
    id: string;
    name: string;
    type: string;
    chairmanName: string | null;
    chairmanJobTitle: string | null;
  };
} | null> {
  if (!workplaceName || !workplaceInn) {
    return null;
  }

  // Нормализуем название (убираем лишние пробелы, приводим к нижнему регистру для сравнения)
  const normalizedName = workplaceName.trim().toLowerCase();

  // Ищем точное совпадение по ИНН и названию
  const mapping = await prisma.workplacePPOMapping.findFirst({
    where: {
      workplaceInn: workplaceInn.trim(),
      workplaceName: {
        equals: normalizedName,
        mode: "insensitive",
      },
    },
    include: {
      ppoOrganization: {
        select: {
          id: true,
          name: true,
          type: true,
          chairmanName: true,
          chairmanJobTitle: true,
        },
      },
    },
  });

  if (mapping) {
    return {
      ppoOrganizationId: mapping.ppoOrganizationId,
      ppoOrganization: mapping.ppoOrganization,
    };
  }

  // Если не найдено точное совпадение, ищем только по ИНН
  const mappingByInn = await prisma.workplacePPOMapping.findFirst({
    where: {
      workplaceInn: workplaceInn.trim(),
    },
    include: {
      ppoOrganization: {
        select: {
          id: true,
          name: true,
          type: true,
          chairmanName: true,
          chairmanJobTitle: true,
        },
      },
    },
  });

  if (mappingByInn) {
    return {
      ppoOrganizationId: mappingByInn.ppoOrganizationId,
      ppoOrganization: mappingByInn.ppoOrganization,
    };
  }

  return null;
}

/**
 * Создать или обновить связь места работы с ППО
 */
export async function createOrUpdateWorkplacePPOMapping(
  workplaceName: string,
  workplaceInn: string,
  ppoOrganizationId: string,
  source: string = "manual",
  verified: boolean = false,
  notes?: string
): Promise<WorkplacePPOMapping> {
  const normalizedName = workplaceName.trim();

  const mapping = await prisma.workplacePPOMapping.upsert({
    where: {
      workplaceName_workplaceInn: {
        workplaceName: normalizedName,
        workplaceInn: workplaceInn.trim(),
      },
    },
    update: {
      ppoOrganizationId,
      source,
      verified,
      notes: notes || null,
      updatedAt: new Date(),
    },
    create: {
      workplaceName: normalizedName,
      workplaceInn: workplaceInn.trim(),
      ppoOrganizationId,
      source,
      verified,
      notes: notes || null,
    },
    include: {
      ppoOrganization: {
        select: {
          id: true,
          name: true,
          type: true,
          chairmanName: true,
          chairmanJobTitle: true,
        },
      },
    },
  });

  return mapping as WorkplacePPOMapping;
}

/**
 * Поиск ППО по части названия места работы (для подсказок)
 */
export async function searchPPOByWorkplaceName(
  query: string,
  limit: number = 10
): Promise<Array<{
  workplaceName: string;
  workplaceInn: string;
  ppoOrganization: {
    id: string;
    name: string;
  };
}>> {
  if (!query || query.length < 2) {
    return [];
  }

  const mappings = await prisma.workplacePPOMapping.findMany({
    where: {
      workplaceName: {
        contains: query,
        mode: "insensitive",
      },
    },
    take: limit,
    include: {
      ppoOrganization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      verified: "desc", // Сначала проверенные
    },
  });

  return mappings.map((m) => ({
    workplaceName: m.workplaceName,
    workplaceInn: m.workplaceInn,
    ppoOrganization: m.ppoOrganization,
  }));
}
