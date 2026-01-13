import { prisma } from "@/lib/prisma";
import { UserRole, OrganizationType } from "@prisma/client";

// Типы руководителей
export type OrgHeadLevel = "PPO" | "MPO" | "RPO";

// Интерфейс для данных руководителя
export interface OrgHeadData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  level: OrgHeadLevel;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    type: OrganizationType;
    inn: string | null;
    chairmanName: string | null;
    chairmanJobTitle: string | null;
    parentId: string | null;
  } | null;
  // Для МПО и РПО - список подчинённых организаций
  childOrganizations?: {
    id: string;
    name: string;
    type: OrganizationType;
    chairmanName: string | null;
  }[];
}

const orgSelect = {
  id: true,
  name: true,
  type: true,
  inn: true,
  chairmanName: true,
  chairmanJobTitle: true,
  parentId: true,
};

/**
 * Проверяет, является ли пользователь Председателем ППО и возвращает его данные
 * @param userId ID пользователя
 * @returns Данные Председателя ППО или null
 */
export async function getPPOHead(userId: string): Promise<OrgHeadData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      isPPOHead: true,
      organizationId: true,
      ppoHeadOrganizationId: true,
      organization: { select: orgSelect },
      ppoHeadOrganization: { select: orgSelect },
    },
  });

  // Председатель ППО может быть PPO_HEAD или isPPOHead=true
  const isPPOHead = user?.role === UserRole.PPO_HEAD || user?.isPPOHead === true;
  const organizationId = user?.ppoHeadOrganizationId || user?.organizationId;

  if (!isPPOHead || !organizationId) {
    return null;
  }

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    level: "PPO",
    organizationId: organizationId,
    organization: user.ppoHeadOrganization || user.organization,
  };
}

/**
 * Проверяет, является ли пользователь Председателем МПО и возвращает его данные
 * @param userId ID пользователя
 * @returns Данные Председателя МПО или null
 */
export async function getMPOHead(userId: string): Promise<OrgHeadData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      isMPOHead: true,
      mpoHeadOrganizationId: true,
      mpoHeadOrganization: {
        select: {
          ...orgSelect,
          children: {
            select: { id: true, name: true, type: true, chairmanName: true },
            where: { isActive: true },
          },
        },
      },
    },
  });

  if (!user?.isMPOHead || !user?.mpoHeadOrganizationId) {
    return null;
  }

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    level: "MPO",
    organizationId: user.mpoHeadOrganizationId,
    organization: user.mpoHeadOrganization,
    childOrganizations: user.mpoHeadOrganization?.children || [],
  };
}

/**
 * Проверяет, является ли пользователь Председателем РПО и возвращает его данные
 * @param userId ID пользователя
 * @returns Данные Председателя РПО или null
 */
export async function getRPOHead(userId: string): Promise<OrgHeadData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      isRPOHead: true,
      rpoHeadOrganizationId: true,
      rpoHeadOrganization: {
        select: {
          ...orgSelect,
          children: {
            select: {
              id: true,
              name: true,
              type: true,
              chairmanName: true,
              children: {
                select: { id: true, name: true, type: true, chairmanName: true },
                where: { isActive: true },
              },
            },
            where: { isActive: true },
          },
        },
      },
    },
  });

  if (!user?.isRPOHead || !user?.rpoHeadOrganizationId) {
    return null;
  }

  // Собираем все подчинённые организации (МПО + их ППО)
  const childOrgs: OrgHeadData["childOrganizations"] = [];
  const rpoOrg = user.rpoHeadOrganization;
  
  if (rpoOrg?.children) {
    for (const mpo of rpoOrg.children) {
      childOrgs.push({
        id: mpo.id,
        name: mpo.name,
        type: mpo.type,
        chairmanName: mpo.chairmanName,
      });
      // Добавляем ППО, подчинённые этой МПО
      if ((mpo as any).children) {
        for (const ppo of (mpo as any).children) {
          childOrgs.push(ppo);
        }
      }
    }
  }

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    level: "RPO",
    organizationId: user.rpoHeadOrganizationId,
    organization: user.rpoHeadOrganization,
    childOrganizations: childOrgs,
  };
}

/**
 * Универсальная функция - определяет уровень руководителя и возвращает его данные
 * @param userId ID пользователя
 * @returns Данные руководителя на максимальном уровне или null
 */
export async function getOrgHead(userId: string): Promise<OrgHeadData | null> {
  // Проверяем в порядке приоритета: РПО > МПО > ППО
  const rpoHead = await getRPOHead(userId);
  if (rpoHead) return rpoHead;

  const mpoHead = await getMPOHead(userId);
  if (mpoHead) return mpoHead;

  const ppoHead = await getPPOHead(userId);
  if (ppoHead) return ppoHead;

  return null;
}

/**
 * Получает все подчинённые организации (рекурсивно)
 * @param organizationId ID организации
 * @returns Массив ID всех подчинённых организаций
 */
export async function getChildOrganizationIds(organizationId: string): Promise<string[]> {
  const result: string[] = [];

  async function collectChildren(parentId: string) {
    const children = await prisma.organization.findMany({
      where: { parentId, isActive: true },
      select: { id: true },
    });

    for (const child of children) {
      result.push(child.id);
      await collectChildren(child.id);
    }
  }

  await collectChildren(organizationId);
  return result;
}

/**
 * Проверяет, принадлежит ли пользователь организации Председателя
 * @param memberId ID пользователя
 * @param organizationId ID организации
 * @returns true если принадлежит, false иначе
 */
export async function isMemberOfOrganization(
  memberId: string,
  organizationId: string
): Promise<boolean> {
  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { organizationId: true },
  });

  return member?.organizationId === organizationId;
}

