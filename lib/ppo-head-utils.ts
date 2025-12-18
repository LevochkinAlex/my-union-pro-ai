import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

/**
 * Проверяет, является ли пользователь Председателем и возвращает его данные
 * @param userId ID пользователя
 * @returns Данные Председателя или null
 */
export async function getPPOHead(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isPPOHead: true,
      organizationId: true,
      ppoHeadOrganizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          inn: true,
          chairmanName: true,
          chairmanJobTitle: true,
        },
      },
      ppoHeadOrganization: {
        select: {
          id: true,
          name: true,
          inn: true,
          chairmanName: true,
          chairmanJobTitle: true,
        },
      },
    },
  });

  // Председатель может быть PPO_HEAD или isPPOHead=true
  const isPPOHead = user?.role === UserRole.PPO_HEAD || user?.isPPOHead === true;
  const organizationId = user?.ppoHeadOrganizationId || user?.organizationId;

  if (!isPPOHead || !organizationId) {
    return null;
  }

  return {
    id: user.id,
    role: user.role,
    isPPOHead: user.isPPOHead,
    organizationId: organizationId,
    organization: user.ppoHeadOrganization || user.organization,
  };
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

