import { prisma } from "@/lib/prisma";

/**
 * Определяет организацию, для которой доступна подписка текущему пользователю.
 * Поддерживает председателя ППО, fallback по связи председателя и сотрудника.
 */
export async function getSubscriptionOrganizationId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isPPOHead: true,
      ppoHeadOrganizationId: true,
      organizationId: true,
      viewMode: true,
    },
  });

  if (user?.isPPOHead && user.ppoHeadOrganizationId) {
    return user.ppoHeadOrganizationId;
  }
  if (user?.viewMode === "PPO_HEAD" && user.ppoHeadOrganizationId) {
    return user.ppoHeadOrganizationId;
  }
  if ((user?.role === "PPO_HEAD" || user?.isPPOHead) && user?.organizationId) {
    return user.organizationId;
  }

  const ppoAsChairman = await prisma.organization.findFirst({
    where: {
      type: "PRIMARY",
      ppoChairman: { id: userId },
    },
    select: { id: true },
  });
  if (ppoAsChairman) return ppoAsChairman.id;

  if (user?.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, type: true },
    });
    if (org?.type === "PRIMARY") return org.id;
  }

  const staffPosition = await prisma.organizationStaff.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    select: { organizationId: true },
  });

  return staffPosition?.organizationId || null;
}

