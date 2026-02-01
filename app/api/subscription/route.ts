import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateOrgSubscription,
  effectiveMemberLimit,
  countActiveMembers,
  subscriptionDisplayStatus,
  hasActiveAccess,
} from "@/lib/subscription";
import { getTariffByKey } from "@/lib/constants/tariffs";

/**
 * Получить организацию пользователя: председатель ППО (по isPPOHead + ppoHeadOrganizationId или viewMode) или сотрудник организации.
 * Так же, как в отчётах и статистике — чтобы председатель всегда видел подписку своей ППО.
 */
async function getSubscriptionOrganizationId(userId: string): Promise<string | null> {
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

  // Председатель ППО: организация из ppoHeadOrganizationId (не зависим от viewMode, чтобы председатель всегда видел подписку)
  if (user?.isPPOHead && user.ppoHeadOrganizationId) {
    return user.ppoHeadOrganizationId;
  }
  // Режим кабинета председателя ППО
  if (user?.viewMode === "PPO_HEAD" && user.ppoHeadOrganizationId) {
    return user.ppoHeadOrganizationId;
  }
  // Председатель, привязанный через organizationId (роль PPO_HEAD или isPPOHead при отсутствии ppoHeadOrganizationId)
  if ((user?.role === "PPO_HEAD" || user?.isPPOHead) && user?.organizationId) {
    return user.organizationId;
  }

  // Fallback: ППО, где пользователь указан председателем (связь Organization.ppoChairman)
  if (userId) {
    const ppoAsChairman = await prisma.organization.findFirst({
      where: {
        type: "PRIMARY",
        ppoChairman: { id: userId },
      },
      select: { id: true },
    });
    if (ppoAsChairman) return ppoAsChairman.id;
  }

  // Fallback: пользователь — член ППО (organizationId указывает на организацию типа PRIMARY)
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

/**
 * GET /api/subscription
 * Подписка организации председателя ППО: лимит, срок, доступные лицензии
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const organizationId = await getSubscriptionOrganizationId(session.user.id);
    if (!organizationId) {
      return NextResponse.json(
        { error: "Доступ только для председателей ППО. Управление подпиской организации доступно в вашем кабинете." },
        { status: 403 }
      );
    }

    const sub = await getOrCreateOrgSubscription(organizationId);
    const displayStatus = subscriptionDisplayStatus(sub);
    const limit = effectiveMemberLimit(sub);
    const activeMembers = await countActiveMembers(organizationId);
    const tariff = sub.tariffKey ? getTariffByKey(sub.tariffKey) : null;

    const periodEnd = sub.status === "TRIAL" ? sub.trialEndsAt : sub.periodEndsAt;

    return NextResponse.json({
      subscription: {
        id: sub.id,
        status: displayStatus,
        memberLimit: limit,
        tariffKey: sub.tariffKey,
        tariffLabel: tariff?.label ?? (sub.memberLimit != null ? `До ${sub.memberLimit} участников` : "Безлимит"),
        trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        periodEndsAt: sub.periodEndsAt?.toISOString() ?? null,
        periodStartedAt: sub.periodStartedAt?.toISOString() ?? null,
        manualOverride: sub.manualOverride,
        adminNote: sub.adminNote ?? null,
      },
      usage: {
        activeMembers,
        availableLicenses: limit == null ? null : Math.max(0, limit - activeMembers),
        isOverLimit: limit != null && activeMembers > limit,
      },
      hasActiveAccess: hasActiveAccess(sub),
    });
  } catch (e) {
    console.error("[api/subscription] GET error:", e);
    return NextResponse.json(
      { error: "Ошибка при получении подписки" },
      { status: 500 }
    );
  }
}
