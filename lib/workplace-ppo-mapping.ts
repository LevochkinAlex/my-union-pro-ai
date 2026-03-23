/**
 * Справочник связи мест работы с ППО
 * Используется для автоматического определения ППО по месту работы (название + ИНН)
 */

import { prisma } from "@/lib/prisma";
import {
  workplaceInnDigits,
  workplaceInnSearchVariants,
  workplaceNameSearchTokens,
} from "@/lib/workplace-inn";

function normalizeWorkplaceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`«»]/g, " ")
    .replace(/[.,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStrongNameMatch(inputName: string, mappedName: string): boolean {
  const a = normalizeWorkplaceName(inputName);
  const b = normalizeWorkplaceName(mappedName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

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
  const options = await findPPOsByWorkplace(workplaceName, workplaceInn);
  const first = options[0];
  if (!first) return null;
  return {
    ppoOrganizationId: first.id,
    ppoOrganization: {
      id: first.id,
      name: first.name,
      type: first.organizationType,
      chairmanName: first.chairmanName,
      chairmanJobTitle: first.chairmanJobTitle,
    },
  };
}

/** Элемент списка ППО по месту работы */
export interface PPOOption {
  id: string;
  name: string;
  chairmanName: string | null;
  chairmanJobTitle: string | null;
  /** Тип записи в справочнике организаций (PRIMARY / REGIONAL / LOCAL) */
  organizationType: string;
}

type MappingRow = Awaited<
  ReturnType<typeof prisma.workplacePPOMapping.findMany>
>[number];

/**
 * Найти все ППО, привязанные к месту работы (по названию и ИНН).
 * Не подставляем «чужую» ППО: при нескольких записях на ИНН оставляем только сильное совпадение названия;
 * плюс нормализация ИНН и fallback по токенам, если юр. название в справочнике и DaData различаются.
 */
export async function findPPOsByWorkplace(
  workplaceName: string,
  workplaceInn: string
): Promise<PPOOption[]> {
  if (!workplaceName?.trim() || !workplaceInn?.trim()) {
    return [];
  }

  const name = workplaceName.trim();
  const innVariants = workplaceInnSearchVariants(workplaceInn);
  const innDigits = workplaceInnDigits(workplaceInn);

  const mappingInclude = {
    ppoOrganization: {
      select: {
        id: true,
        name: true,
        type: true,
        chairmanName: true,
        chairmanJobTitle: true,
      },
    },
  } as const;

  const orderBy = [{ verified: "desc" as const }, { workplaceName: "asc" as const }];

  let mappings: MappingRow[] = [];

  // 1) Точное совпадение: варианты ИНН + название без учёта регистра
  mappings = await prisma.workplacePPOMapping.findMany({
    where: {
      workplaceInn: { in: innVariants },
      workplaceName: { equals: name, mode: "insensitive" },
    },
    include: mappingInclude,
    orderBy,
  });

  // 2) Все строки по вариантам ИНН → только сильное совпадение названия
  if (mappings.length === 0) {
    const byInn = await prisma.workplacePPOMapping.findMany({
      where: { workplaceInn: { in: innVariants } },
      include: mappingInclude,
      orderBy,
    });
    mappings = byInn.filter((m) => isStrongNameMatch(name, m.workplaceName));
  }

  // 3) ИНН в БД с маской/пробелами — сравнение только по цифрам
  if (mappings.length === 0 && innDigits.length >= 10) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT m.id
      FROM "WorkplacePPOMapping" m
      WHERE regexp_replace(COALESCE(m."workplaceInn", ''), '[^0-9]', '', 'g') = ${innDigits}
    `;
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length > 0) {
      const byInn = await prisma.workplacePPOMapping.findMany({
        where: { id: { in: ids } },
        include: mappingInclude,
        orderBy,
      });
      mappings = byInn.filter((m) => isStrongNameMatch(name, m.workplaceName));
    }
  }

  // 4) Разное юр. имя в справочнике vs DaData — по значимым словам, сузить по ИНН
  if (mappings.length === 0) {
    const tokens = workplaceNameSearchTokens(name);
    let tokenMappings: MappingRow[] = [];
    if (tokens.length >= 2) {
      tokenMappings = await prisma.workplacePPOMapping.findMany({
        where: {
          AND: tokens.slice(0, 2).map((t) => ({
            workplaceName: { contains: t, mode: "insensitive" as const },
          })),
        },
        include: mappingInclude,
        orderBy,
        take: 40,
      });
    } else if (tokens.length === 1) {
      tokenMappings = await prisma.workplacePPOMapping.findMany({
        where: {
          workplaceName: { contains: tokens[0], mode: "insensitive" },
        },
        include: mappingInclude,
        orderBy,
        take: 40,
      });
    }

    const innMatched = tokenMappings.filter((m) => {
      const md = workplaceInnDigits(m.workplaceInn);
      return md === innDigits || innVariants.includes(m.workplaceInn.trim());
    });
    if (innMatched.length > 0) {
      mappings = innMatched;
    } else if (tokenMappings.length === 1) {
      mappings = tokenMappings;
    }
  }

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
        organizationType: org.type,
      });
      continue;
    }
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
          organizationType: "PRIMARY",
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
      verified: "desc",
    },
  });

  return mappings.map((m) => ({
    workplaceName: m.workplaceName,
    workplaceInn: m.workplaceInn,
    ppoOrganization: m.ppoOrganization,
  }));
}
