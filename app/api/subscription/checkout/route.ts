import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateOrgSubscription,
  getPriceForPeriod,
  getPeriodDays,
  type TariffPeriod,
} from "@/lib/subscription";
import {
  calculateAmountForMemberCountPeriod,
  getRatesForMemberCount,
  getTariffByKey as getPlan,
} from "@/lib/constants/tariffs";
import { isTBankConfigured, tbankInitPayment } from "@/lib/tbank-acquiring";

/**
 * POST /api/subscription/checkout
 * Создаёт платёж в T-Bank эквайринге и возвращает PaymentURL для редиректа.
 * Body: { tariffKey?: string, customMembers?: number, period: "half_year" | "year" }
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
    const customMembersRaw = body?.customMembers;
    const customMembers =
      typeof customMembersRaw === "number"
        ? customMembersRaw
        : parseInt(String(customMembersRaw ?? ""), 10);

    if (period !== "half_year" && period !== "year") {
      return NextResponse.json(
        { error: "Для оплаты доступны только периоды 6 или 12 месяцев" },
        { status: 400 }
      );
    }

    let finalMemberLimit: number;
    let amountRub: number;
    let tariffLabel: string;
    let effectiveTariffKey: string;
    let ratePerUserPerMonth: number;

    if (Number.isFinite(customMembers) && customMembers > 0) {
      finalMemberLimit = Math.floor(customMembers);
      const rates = getRatesForMemberCount(finalMemberLimit);
      amountRub = calculateAmountForMemberCountPeriod(finalMemberLimit, period);
      tariffLabel = `Индивидуально (${finalMemberLimit} пользователей)`;
      effectiveTariffKey = `CUSTOM_${finalMemberLimit}`;
      ratePerUserPerMonth = period === "half_year" ? rates.sixMonthRate : rates.yearRate;
    } else {
      if (!tariffKey) {
        return NextResponse.json(
          { error: "Укажите тариф или количество пользователей" },
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

      if (plan.isUnlimited || !plan.memberLimit) {
        return NextResponse.json(
          { error: "Для тарифа «Более 3600» свяжитесь с нами для индивидуального договора" },
          { status: 400 }
        );
      }

      finalMemberLimit = plan.memberLimit;
      amountRub = getPriceForPeriod(plan, period);
      tariffLabel = plan.label;
      effectiveTariffKey = tariffKey;
      ratePerUserPerMonth = period === "half_year" ? plan.pricePerUserPerMonth : plan.pricePerUserPerYear;
    }

    const amountCents = Math.round(amountRub * 100);
    const days = getPeriodDays(period);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + days);

    if (!isTBankConfigured()) {
      return NextResponse.json(
        {
          error:
            "Эквайринг T-Bank не настроен. Заполните TBANK_TERMINAL_KEY и TBANK_TERMINAL_PASSWORD в .env.local",
        },
        { status: 500 }
      );
    }

    const sub = await getOrCreateOrgSubscription(chairman.organizationId);
    const payment = await prisma.organizationPayment.create({
      data: {
        organizationId: chairman.organizationId,
        subscriptionId: sub.id,
        amountCents,
        currency: "RUB",
        periodStart: now,
        periodEnd,
        status: "PENDING",
        metadata: {
          tariffKey: effectiveTariffKey,
          period,
          memberLimit: finalMemberLimit,
          tariffLabel,
          ratePerUserPerMonth,
          customMembers: Number.isFinite(customMembers) && customMembers > 0 ? finalMemberLimit : null,
          source: "tbank_checkout",
        },
      },
    });

    const origin = new URL(request.url).origin;
    const orderId = `SUB_${payment.id}`;
    const successUrl = `${origin}/dashboard/subscription?payment=success&localPaymentId=${payment.id}`;
    const failUrl = `${origin}/dashboard/subscription?payment=fail&localPaymentId=${payment.id}`;
    const notificationUrl = `${origin}/api/subscription/tbank/notify`;

    const tbank = await tbankInitPayment({
      amount: amountCents,
      orderId,
      description: `Подписка MyUnion (${tariffLabel}, ${period})`,
      successUrl,
      failUrl,
      notificationUrl,
      customerKey: `org_${chairman.organizationId}`,
    });

    if (!tbank.Success || !tbank.PaymentURL || !tbank.PaymentId) {
      await prisma.organizationPayment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          metadata: {
            tariffKey: effectiveTariffKey,
            period,
            memberLimit: finalMemberLimit,
            tariffLabel,
            ratePerUserPerMonth,
            customMembers: Number.isFinite(customMembers) && customMembers > 0 ? finalMemberLimit : null,
            source: "tbank_checkout",
            tbank: tbank as unknown as Record<string, unknown>,
          },
        },
      });
      return NextResponse.json(
        { error: tbank.Message || "Не удалось создать платёж в T-Bank" },
        { status: 502 }
      );
    }

    await prisma.organizationPayment.update({
      where: { id: payment.id },
      data: {
        externalId: String(tbank.PaymentId),
        metadata: {
          tariffKey: effectiveTariffKey,
          period,
          memberLimit: finalMemberLimit,
          tariffLabel,
          ratePerUserPerMonth,
          customMembers: Number.isFinite(customMembers) && customMembers > 0 ? finalMemberLimit : null,
          source: "tbank_checkout",
          orderId,
          paymentUrl: tbank.PaymentURL,
        },
      },
    });

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        externalId: tbank.PaymentId,
        amountCents: payment.amountCents,
        periodStart: payment.periodStart.toISOString(),
        periodEnd: payment.periodEnd.toISOString(),
        status: "PENDING",
      },
      paymentUrl: tbank.PaymentURL,
    });
  } catch (e) {
    console.error("[api/subscription/checkout] POST error:", e);
    return NextResponse.json(
      { error: "Ошибка при оформлении подписки" },
      { status: 500 }
    );
  }
}
