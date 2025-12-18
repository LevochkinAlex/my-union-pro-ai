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
      organizationId: true,
      organization: {
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

  if (user?.role !== UserRole.PPO_HEAD || !user.organizationId) {
    return null;
  }

  return user;
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

