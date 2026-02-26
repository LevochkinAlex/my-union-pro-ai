import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionOrganizationId } from "@/lib/subscription-org";
import { isTBankSuccessStatus, tbankGetState } from "@/lib/tbank-acquiring";
import {
  finalizeSubscriptionPayment,
  markSubscriptionPaymentFailed,
  markSubscriptionPaymentRefunded,
} from "@/lib/subscription-payment";

/**
 * POST /api/subscription/confirm
 * Проверка статуса оплаты в T-Bank и активация подписки при успешной оплате.
 * Body: { localPaymentId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const localPaymentId = String(body?.localPaymentId || "").trim();
    if (!localPaymentId) {
      return NextResponse.json({ error: "Не передан localPaymentId" }, { status: 400 });
    }

    const organizationId = await getSubscriptionOrganizationId(session.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const payment = await prisma.organizationPayment.findFirst({
      where: { id: localPaymentId, organizationId },
      select: { id: true, externalId: true, status: true },
    });
    if (!payment) {
      return NextResponse.json({ error: "Платеж не найден" }, { status: 404 });
    }

    if (payment.status === "COMPLETED") {
      return NextResponse.json({ success: true, status: "COMPLETED", alreadyCompleted: true });
    }
    if (payment.status === "REFUNDED") {
      return NextResponse.json({ success: false, refunded: true, status: "REFUNDED", alreadyCompleted: true });
    }

    if (!payment.externalId) {
      return NextResponse.json({ error: "У платежа нет внешнего ID" }, { status: 400 });
    }

    const tbank = await tbankGetState(payment.externalId);
    if (!tbank.Success) {
      return NextResponse.json(
        { error: tbank.Message || "Не удалось получить статус платежа", gateway: tbank },
        { status: 502 }
      );
    }

    if (isTBankSuccessStatus(tbank.Status)) {
      await finalizeSubscriptionPayment(localPaymentId, tbank.Status || "CONFIRMED", tbank as unknown as Record<string, unknown>);
      return NextResponse.json({ success: true, status: tbank.Status || "CONFIRMED" });
    }

    if (tbank.Status === "REFUNDED") {
      await markSubscriptionPaymentRefunded(localPaymentId, tbank.Status, tbank as unknown as Record<string, unknown>);
      return NextResponse.json({ success: false, refunded: true, status: "REFUNDED", message: "Платеж возвращен" });
    }

    if (tbank.Status === "REJECTED" || tbank.Status === "CANCELED" || tbank.Status === "DEADLINE_EXPIRED") {
      await markSubscriptionPaymentFailed(localPaymentId, tbank.Status, tbank as unknown as Record<string, unknown>);
    }

    return NextResponse.json({
      success: false,
      status: tbank.Status || "UNKNOWN",
      message: "Платеж еще не подтвержден",
    });
  } catch (e) {
    console.error("[api/subscription/confirm] POST error:", e);
    return NextResponse.json({ error: "Ошибка подтверждения платежа" }, { status: 500 });
  }
}

