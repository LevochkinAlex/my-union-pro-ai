import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyMemberLimit } from "@/lib/subscription";
import { getTariffByKey } from "@/lib/constants/tariffs";

function ensureSuperAdmin(session: { user?: { id?: string; role?: string } } | null) {
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  }
  if (session.user?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Доступ запрещен" }, { status: 403 }) };
  }
  return { error: null };
}

/**
 * PATCH /api/admin/subscription/payments/[id]
 * Проставить или изменить кол-во участников (memberLimit) у уже оплаченного платежа
 * и применить лимит к организации.
 * Body: { memberLimit: number, tariffKey?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const { id: paymentId } = await params;
  const body = await request.json().catch(() => ({}));
  const memberLimit = body?.memberLimit != null ? parseInt(String(body.memberLimit), 10) : null;
  const tariffKey = body?.tariffKey != null ? String(body.tariffKey).trim() : null;

  if (memberLimit == null || !Number.isFinite(memberLimit) || memberLimit < 1) {
    return NextResponse.json(
      { error: "Укажите memberLimit (положительное число участников)" },
      { status: 400 }
    );
  }

  const payment = await prisma.organizationPayment.findUnique({
    where: { id: paymentId },
    include: { organization: { select: { id: true, name: true } } },
  });

  if (!payment) {
    return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
  }

  const meta = (payment.metadata as Record<string, unknown>) || {};
  const tariffLabel = tariffKey ? (getTariffByKey(tariffKey)?.label ?? `До ${memberLimit} участников`) : `До ${memberLimit} участников`;

  await prisma.organizationPayment.update({
    where: { id: paymentId },
    data: {
      metadata: {
        ...meta,
        memberLimit,
        tariffKey: tariffKey ?? meta.tariffKey,
        tariffLabel,
      },
    },
  });

  const sub = await prisma.organizationSubscription.findUnique({
    where: { organizationId: payment.organizationId },
  });
  if (sub) {
    await prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        memberLimit,
        tariffKey: tariffKey ?? sub.tariffKey,
      },
    });
  }

  await applyMemberLimit(payment.organizationId);

  const updated = await prisma.organizationPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      organizationId: true,
      amountCents: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      metadata: true,
      organization: { select: { name: true } },
    },
  });

  const updatedMeta = (updated!.metadata as Record<string, unknown>) || {};
  return NextResponse.json({
    success: true,
    payment: {
      id: updated!.id,
      organizationName: updated!.organization?.name ?? null,
      amountRub: (updated!.amountCents / 100).toFixed(2),
      periodStart: updated!.periodStart.toISOString(),
      periodEnd: updated!.periodEnd.toISOString(),
      status: updated!.status,
      memberLimit: updatedMeta.memberLimit ?? memberLimit,
      tariffLabel: updatedMeta.tariffLabel ?? tariffLabel,
    },
  });
}
