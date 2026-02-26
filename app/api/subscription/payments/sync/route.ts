import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { prisma } from "@/lib/prisma";
import { isTBankSuccessStatus, tbankGetState } from "@/lib/tbank-acquiring";
import {
  finalizeSubscriptionPayment,
  markSubscriptionPaymentFailed,
  markSubscriptionPaymentRefunded,
} from "@/lib/subscription-payment";

/**
 * POST /api/subscription/payments/sync
 * Принудительная синхронизация последних платежей с T-Bank
 */
export async function POST() {
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

    const payments = await prisma.organizationPayment.findMany({
      where: {
        organizationId: chairman.organizationId,
        externalId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        externalId: true,
        status: true,
      },
    });

    let checked = 0;
    let updated = 0;
    const errors: Array<{ paymentId: string; message: string }> = [];

    for (const payment of payments) {
      if (!payment.externalId) continue;
      checked++;
      try {
        const state = await tbankGetState(payment.externalId);
        if (!state.Success) {
          errors.push({
            paymentId: payment.id,
            message: state.Message || "GetState failed",
          });
          continue;
        }

        const status = String(state.Status || "UNKNOWN");
        if (status === "REFUNDED") {
          await markSubscriptionPaymentRefunded(
            payment.id,
            status,
            state as unknown as Record<string, unknown>
          );
          updated++;
          continue;
        }

        if (isTBankSuccessStatus(status)) {
          if (payment.status !== "COMPLETED") {
            await finalizeSubscriptionPayment(
              payment.id,
              status,
              state as unknown as Record<string, unknown>
            );
            updated++;
          }
          continue;
        }

        if (
          status === "REJECTED" ||
          status === "CANCELED" ||
          status === "DEADLINE_EXPIRED"
        ) {
          if (payment.status !== "FAILED") {
            await markSubscriptionPaymentFailed(
              payment.id,
              status,
              state as unknown as Record<string, unknown>
            );
            updated++;
          }
        }
      } catch (error) {
        errors.push({
          paymentId: payment.id,
          message: error instanceof Error ? error.message : "sync error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked,
      updated,
      errorsCount: errors.length,
      errors: errors.slice(0, 5),
    });
  } catch (e) {
    console.error("[api/subscription/payments/sync] POST error:", e);
    return NextResponse.json(
      { error: "Ошибка синхронизации платежей" },
      { status: 500 }
    );
  }
}

