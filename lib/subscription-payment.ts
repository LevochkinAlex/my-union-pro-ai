import { prisma } from "@/lib/prisma";
import { applyMemberLimit, getOrCreateOrgSubscription } from "@/lib/subscription";

type PaymentMeta = {
  tariffKey?: string;
  period?: string;
  memberLimit?: number | null;
  [key: string]: unknown;
};

export async function finalizeSubscriptionPayment(
  localPaymentId: string,
  gatewayStatus: string,
  gatewayPayload?: Record<string, unknown>
) {
  const payment = await prisma.organizationPayment.findUnique({
    where: { id: localPaymentId },
  });
  if (!payment) {
    throw new Error("Платеж не найден");
  }

  if (payment.status === "COMPLETED") {
    return payment;
  }

  const meta = (payment.metadata || {}) as PaymentMeta;
  const memberLimit =
    typeof meta.memberLimit === "number" ? meta.memberLimit : null;
  const tariffKey = typeof meta.tariffKey === "string" ? meta.tariffKey : null;

  await prisma.organizationPayment.update({
    where: { id: payment.id },
    data: {
      status: "COMPLETED",
      metadata: {
        ...meta,
        gatewayStatus,
        confirmedAt: new Date().toISOString(),
        gatewayPayload: gatewayPayload ?? null,
      },
    },
  });

  const sub = await getOrCreateOrgSubscription(payment.organizationId);
  await prisma.organizationSubscription.update({
    where: { id: sub.id },
    data: {
      status: "ACTIVE",
      tariffKey,
      memberLimit,
      trialEndsAt: null,
      periodStartedAt: payment.periodStart,
      periodEndsAt: payment.periodEnd,
      manualOverride: false,
      addedDaysByAdmin: null,
    },
  });

  await applyMemberLimit(payment.organizationId);
  return payment;
}

export async function markSubscriptionPaymentFailed(
  localPaymentId: string,
  gatewayStatus: string,
  gatewayPayload?: Record<string, unknown>
) {
  const payment = await prisma.organizationPayment.findUnique({
    where: { id: localPaymentId },
  });
  if (!payment) return null;

  const meta = (payment.metadata || {}) as PaymentMeta;
  return prisma.organizationPayment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      metadata: {
        ...meta,
        gatewayStatus,
        failedAt: new Date().toISOString(),
        gatewayPayload: gatewayPayload ?? null,
      },
    },
  });
}

export async function markSubscriptionPaymentRefunded(
  localPaymentId: string,
  gatewayStatus: string,
  gatewayPayload?: Record<string, unknown>
) {
  const payment = await prisma.organizationPayment.findUnique({
    where: { id: localPaymentId },
  });
  if (!payment) return null;

  const meta = (payment.metadata || {}) as PaymentMeta;
  return prisma.organizationPayment.update({
    where: { id: payment.id },
    data: {
      status: "REFUNDED",
      metadata: {
        ...meta,
        gatewayStatus,
        refundedAt: new Date().toISOString(),
        gatewayPayload: gatewayPayload ?? null,
      },
    },
  });
}

