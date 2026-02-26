import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getOrCreateOrgSubscription,
  effectiveMemberLimit,
  countActiveMembers,
  subscriptionDisplayStatus,
  hasActiveAccess,
} from "@/lib/subscription";
import { getTariffByKey } from "@/lib/constants/tariffs";
import { getSubscriptionOrganizationId } from "@/lib/subscription-org";

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
    // При ошибке (БД, таблица подписок не создана) отдаём нейтральные данные 200, чтобы дашборд и виджет не ломались
    return NextResponse.json({
      subscription: {
        id: null,
        status: "NONE",
        memberLimit: null,
        tariffKey: null,
        tariffLabel: "—",
        trialEndsAt: null,
        periodEndsAt: null,
        periodStartedAt: null,
        manualOverride: false,
        adminNote: null,
      },
      usage: {
        activeMembers: 0,
        availableLicenses: null,
        isOverLimit: false,
      },
      hasActiveAccess: false,
    });
  }
}
