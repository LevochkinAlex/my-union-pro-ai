import { NextRequest, NextResponse } from "next/server";
import { createTBankToken, isTBankSuccessStatus } from "@/lib/tbank-acquiring";
import {
  finalizeSubscriptionPayment,
  markSubscriptionPaymentFailed,
  markSubscriptionPaymentRefunded,
} from "@/lib/subscription-payment";

function extractLocalPaymentId(orderId?: string): string | null {
  if (!orderId) return null;
  if (!orderId.startsWith("SUB_")) return null;
  return orderId.slice(4) || null;
}

/**
 * POST /api/subscription/tbank/notify
 * Асинхронный callback от T-Bank.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const token = String(payload?.Token || "");

    const expected = createTBankToken(payload);
    if (!token || !expected || token !== expected) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const orderId = typeof payload.OrderId === "string" ? payload.OrderId : "";
    const localPaymentId = extractLocalPaymentId(orderId);
    if (!localPaymentId) {
      return NextResponse.json({ success: false, message: "Unknown order id" }, { status: 400 });
    }

    const status = typeof payload.Status === "string" ? payload.Status : "UNKNOWN";
    if (isTBankSuccessStatus(status)) {
      await finalizeSubscriptionPayment(localPaymentId, status, payload);
      return NextResponse.json({ success: true });
    }

    if (status === "REFUNDED") {
      await markSubscriptionPaymentRefunded(localPaymentId, status, payload);
      return NextResponse.json({ success: true, refunded: true });
    }

    if (status === "REJECTED" || status === "CANCELED" || status === "DEADLINE_EXPIRED") {
      await markSubscriptionPaymentFailed(localPaymentId, status, payload);
    }

    return NextResponse.json({ success: true, skipped: true, status });
  } catch (e) {
    console.error("[api/subscription/tbank/notify] POST error:", e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

