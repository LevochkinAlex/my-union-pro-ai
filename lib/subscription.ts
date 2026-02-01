import { prisma } from "./prisma";
import { SubscriptionStatus } from "@prisma/client";
import {
  getTariffByKey,
  TARIFF_PLANS,
  TRIAL_DAYS,
  getPriceForPeriod,
  getPeriodDays,
  type TariffPeriod,
} from "./constants/tariffs";

export type { TariffPeriod };

/** Получить или создать подписку организации */
export async function getOrCreateOrgSubscription(organizationId: string) {
  let sub = await prisma.organizationSubscription.findUnique({
    where: { organizationId },
  });
  if (!sub) {
    sub = await prisma.organizationSubscription.create({
      data: {
        organizationId,
        status: "NONE",
      },
    });
  }
  return sub;
}

/** Эффективный лимит участников: из подписки или безлимит */
export function effectiveMemberLimit(sub: {
  memberLimit: number | null;
  tariffKey: string | null;
  status: string;
}): number | null {
  if (sub.status === "NONE" || sub.status === "EXPIRED") return 0;
  if (sub.memberLimit != null) return sub.memberLimit;
  const plan = sub.tariffKey ? getTariffByKey(sub.tariffKey) : null;
  if (plan?.memberLimit != null) return plan.memberLimit;
  return null; // безлимит
}

/** Количество активных (не заблокированных по подписке) членов организации */
export async function countActiveMembers(organizationId: string): Promise<number> {
  return prisma.user.count({
    where: {
      organizationId,
      membershipStatus: "APPROVED",
      subscriptionBlockedAt: null,
    },
  });
}

/** Заблокировать членов сверх лимита (последние зарегистрированные) */
export async function blockMembersOverLimit(
  organizationId: string,
  limit: number
): Promise<number> {
  const over = await prisma.user.findMany({
    where: {
      organizationId,
      membershipStatus: "APPROVED",
      subscriptionBlockedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (over.length <= limit) return 0;
  const toBlock = over.slice(limit);
  const now = new Date();
  await prisma.user.updateMany({
    where: { id: { in: toBlock.map((u) => u.id) } },
    data: { subscriptionBlockedAt: now },
  });
  return toBlock.length;
}

/** Разблокировать всех по подписке в организации (при повышении тарифа) */
export async function unblockAllBySubscription(organizationId: string): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { organizationId, subscriptionBlockedAt: { not: null } },
    data: { subscriptionBlockedAt: null },
  });
  return result.count;
}

/** Применить лимит: заблокировать лишних или разблокировать при увеличении лимита */
export async function applyMemberLimit(organizationId: string): Promise<void> {
  const sub = await getOrCreateOrgSubscription(organizationId);
  const limit = effectiveMemberLimit(sub);
  if (limit === null) {
    await unblockAllBySubscription(organizationId);
    return;
  }
  if (limit === 0) return;
  await blockMembersOverLimit(organizationId, limit);
}

/** Статус подписки для отображения: TRIAL / ACTIVE / EXPIRED и т.д. */
export function subscriptionDisplayStatus(sub: {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  periodEndsAt: Date | null;
}): SubscriptionStatus {
  if (sub.status === "NONE" || sub.status === "CANCELLED") return sub.status;
  const now = new Date();
  if (sub.status === "TRIAL" && sub.trialEndsAt && sub.trialEndsAt < now) return "EXPIRED";
  if (sub.status === "ACTIVE" && sub.periodEndsAt && sub.periodEndsAt < now) return "EXPIRED";
  return sub.status;
}

/** Есть ли у организации действующий доступ (триал или активная подписка) */
export function hasActiveAccess(sub: {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  periodEndsAt: Date | null;
}): boolean {
  const status = subscriptionDisplayStatus(sub);
  return status === "TRIAL" || status === "ACTIVE";
}

/** Активировать 14-дневный триал без карты */
export async function activateTrial(organizationId: string): Promise<void> {
  const sub = await getOrCreateOrgSubscription(organizationId);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
  await prisma.organizationSubscription.update({
    where: { id: sub.id },
    data: {
      status: "TRIAL",
      trialEndsAt,
      periodEndsAt: null,
      periodStartedAt: null,
      tariffKey: null,
      memberLimit: null,
      manualOverride: false,
      addedDaysByAdmin: null,
      adminNote: null,
    },
  });
}

/** Полный список тарифов для выбора */
export function getTariffPlans() {
  return TARIFF_PLANS;
}

export { getTariffByKey, getPriceForPeriod, getPeriodDays, TRIAL_DAYS };
