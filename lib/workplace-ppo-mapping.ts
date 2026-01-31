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

/** Элемент списка ППО по месту работы */
export interface PPOOption {
  id: string;
  name: string;
  chairmanName: string | null;
  chairmanJobTitle: string | null;
}

/**
 * Найти все ППО, привязанные к месту работы (по ИНН).
 * У одной организации (ИНН) может быть несколько записей в справочнике → несколько ППО на выбор.
 */
export async function findPPOsByWorkplace(
  workplaceName: string,
  workplaceInn: string
): Promise<PPOOption[]> {
  if (!workplaceName?.trim() || !workplaceInn?.trim()) {
    return [];
  }

  const inn = workplaceInn.trim();

  const mappings = await prisma.workplacePPOMapping.findMany({
    where: {
      workplaceInn: inn,
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
    orderBy: [{ verified: "desc" }, { workplaceName: "asc" }],
  });

  const seen = new Set<string>();
  const result: PPOOption[] = [];

  for (const m of mappings) {
    const org = m.ppoOrganization;
    if (org.type === "PRIMARY") {
      if (seen.has(org.id)) continue;
      seen.add(org.id);
      result.push({
        id: org.id,
        name: org.name,
        chairmanName: org.chairmanName,
        chairmanJobTitle: org.chairmanJobTitle,
      });
      continue;
    }
    // Региональная или местная организация: подставляем её первички (ППО), например «ППО аппарата МООП РЗ»
    if (org.type === "REGIONAL" || org.type === "LOCAL") {
      const primaryChildren = await prisma.organization.findMany({
        where: { parentId: org.id, type: "PRIMARY" },
        select: {
          id: true,
          name: true,
          chairmanName: true,
          chairmanJobTitle: true,
        },
      });
      for (const child of primaryChildren) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        result.push({
          id: child.id,
          name: child.name,
          chairmanName: child.chairmanName,
          chairmanJobTitle: child.chairmanJobTitle,
        });
      }
    }
  }
  return result;
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
