import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateOrgSubscription,
  getPriceForPeriod,
  getPeriodDays,
  applyMemberLimit,
  type TariffPeriod,
} from "@/lib/subscription";
import { getTariffByKey as getPlan } from "@/lib/constants/tariffs";

/**
 * POST /api/subscription/checkout
 * Мок оформления подписки: тариф + период → создаём платёж COMPLETED и активируем подписку
 * Body: { tariffKey: string, period: "month" | "quarter" | "half_year" | "year" }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const chairman = await getPPOHead(session.user.id);
    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const tariffKey = String(body?.tariffKey ?? "").trim();
    const period = (body?.period ?? "year") as TariffPeriod;

    if (!tariffKey) {
      return NextResponse.json(
        { error: "Укажите тариф (tariffKey)" },
        { status: 400 }
      );
    }

    const plan = getPlan(tariffKey);
    if (!plan) {
      return NextResponse.json(
        { error: "Тариф не найден" },
        { status: 400 }
      );
    }

    if (plan.isUnlimited) {
      return NextResponse.json(
        { error: "Для тарифа «Более 3600» свяжитесь с нами для индивидуального договора" },
        { status: 400 }
      );
    }

    const amountCents = Math.round(getPriceForPeriod(plan, period) * 100);
    const days = getPeriodDays(period);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + days);

    const sub = await getOrCreateOrgSubscription(chairman.organizationId);

    // Мок: создаём платёж со статусом COMPLETED
    const payment = await prisma.organizationPayment.create({
      data: {
        organizationId: chairman.organizationId,
        subscriptionId: sub.id,
        amountCents,
        currency: "RUB",
        periodStart: now,
        periodEnd,
        status: "COMPLETED",
        externalId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        metadata: {
          tariffKey,
          period,
          memberLimit: plan.memberLimit,
          source: "mock_checkout",
        },
      },
    });

    // Активируем подписку
    await prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        tariffKey,
        memberLimit: plan.memberLimit,
        trialEndsAt: null,
        periodStartedAt: now,
        periodEndsAt: periodEnd,
        manualOverride: false,
        addedDaysByAdmin: null,
        adminNote: null,
      },
    });

    await applyMemberLimit(chairman.organizationId);

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        amountCents: payment.amountCents,
        periodStart: payment.periodStart.toISOString(),
        periodEnd: payment.periodEnd.toISOString(),
        status: payment.status,
      },
      subscription: {
        status: "ACTIVE",
        memberLimit: plan.memberLimit,
        periodEndsAt: periodEnd.toISOString(),
      },
    });
  } catch (e) {
    console.error("[api/subscription/checkout] POST error:", e);
    return NextResponse.json(
      { error: "Ошибка при оформлении подписки" },
      { status: 500 }
    );
  }
}
