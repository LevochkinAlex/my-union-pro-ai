import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeSubscriptionPayment } from "@/lib/subscription-payment";

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
 * GET /api/admin/subscription/payments
 * Поиск платежей по сумме, организации или номеру счёта-оферты.
 * Параметры: amountRub (23700), amountCents (2370000), organizationId, offerNumber (MYU-202603-8702), limit
 * Возвращает: кто оплатил, на сколько (periodStart–periodEnd), какое количество (memberLimit из metadata).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const { searchParams } = new URL(request.url);
  const amountRub = searchParams.get("amountRub");
  const amountCentsParam = searchParams.get("amountCents");
  const organizationId = searchParams.get("organizationId");
  const offerNumber = searchParams.get("offerNumber");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

  const where: Record<string, unknown> = {};
  if (organizationId) where.organizationId = organizationId;
  if (amountCentsParam) {
    const cents = parseInt(amountCentsParam, 10);
    if (!Number.isNaN(cents)) where.amountCents = cents;
  } else if (amountRub) {
    const rub = parseFloat(amountRub.replace(/\s/g, "").replace(",", "."));
    if (!Number.isNaN(rub)) where.amountCents = Math.round(rub * 100);
  }

  const payments = await prisma.organizationPayment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      organization: { select: { id: true, name: true, type: true } },
    },
  });

  let list = payments;
  if (offerNumber && offerNumber.trim()) {
    const needle = offerNumber.trim().toUpperCase();
    list = payments.filter((p) => {
      const meta = (p.metadata as Record<string, unknown>) || {};
      const num = (meta.offerNumber as string) || "";
      return num.toUpperCase() === needle || num.toUpperCase().includes(needle);
    });
  }

  const items = list.map((p) => {
    const meta = (p.metadata as Record<string, unknown>) || {};
    const periodMonths =
      p.periodStart && p.periodEnd
        ? Math.round(
            (new Date(p.periodEnd).getTime() - new Date(p.periodStart).getTime()) / (30.44 * 24 * 60 * 60 * 1000)
          )
        : null;
    return {
      id: p.id,
      organizationId: p.organizationId,
      organizationName: p.organization?.name ?? null,
      amountCents: p.amountCents,
      amountRub: (p.amountCents / 100).toFixed(2),
      currency: p.currency,
      periodStart: p.periodStart?.toISOString() ?? null,
      periodEnd: p.periodEnd?.toISOString() ?? null,
      periodMonths,
      status: p.status,
      createdAt: p.createdAt?.toISOString() ?? null,
      externalId: p.externalId,
      offerNumber: (meta.offerNumber as string) ?? null,
      memberLimit: typeof meta.memberLimit === "number" ? meta.memberLimit : null,
      tariffLabel: (meta.tariffLabel as string) ?? null,
      period: (meta.period as string) ?? null,
    };
  });

  return NextResponse.json({
    payments: items,
    total: items.length,
  });
}

/**
 * POST /api/admin/subscription/payments
 * Зарегистрировать оплату по счёту-оферте (ручное зачисление).
 * Body: { organizationId, amountCents, periodStart, periodEnd, memberLimit?, tariffKey?, tariffLabel?, offerNumber? }
 * periodStart/periodEnd — ISO строки. После создания платёж помечается COMPLETED и подписка продлевается.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const body = await request.json().catch(() => ({}));
  const organizationId = String(body?.organizationId ?? "").trim();
  const amountCents = typeof body?.amountCents === "number" ? body.amountCents : parseInt(String(body?.amountCents ?? 0), 10);
  const periodStartStr = body?.periodStart;
  const periodEndStr = body?.periodEnd;
  const memberLimit = body?.memberLimit != null ? parseInt(String(body.memberLimit), 10) : null;
  const tariffKey = body?.tariffKey != null ? String(body.tariffKey) : null;
  const tariffLabel = body?.tariffLabel != null ? String(body.tariffLabel) : null;
  const offerNumber = body?.offerNumber != null ? String(body.offerNumber).trim() : null;

  if (!organizationId || !Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: "Укажите organizationId и amountCents (положительное число)" },
      { status: 400 }
    );
  }

  const periodStart = periodStartStr ? new Date(periodStartStr) : new Date();
  const periodEnd = periodEndStr ? new Date(periodEndStr) : (() => {
    const end = new Date(periodStart);
    end.setMonth(end.getMonth() + 6);
    return end;
  })();
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return NextResponse.json(
      { error: "Некорректные periodStart или periodEnd (ISO даты)" },
      { status: 400 }
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
  }

  const { getOrCreateOrgSubscription } = await import("@/lib/subscription");
  const sub = await getOrCreateOrgSubscription(organizationId);

  const payment = await prisma.organizationPayment.create({
    data: {
      organizationId,
      subscriptionId: sub.id,
      amountCents,
      currency: "RUB",
      periodStart,
      periodEnd,
      status: "PENDING",
      metadata: {
        tariffKey: tariffKey ?? undefined,
        tariffLabel: tariffLabel ?? undefined,
        memberLimit: memberLimit ?? undefined,
        period: "half_year",
        source: "admin_invoice",
        offerNumber: offerNumber ?? undefined,
      },
    },
  });

  await finalizeSubscriptionPayment(payment.id, "admin_invoice", { offerNumber: offerNumber ?? undefined });

  const updated = await prisma.organizationPayment.findUnique({
    where: { id: payment.id },
    include: { organization: { select: { name: true } } },
  });

  return NextResponse.json({
    success: true,
    payment: {
      id: updated!.id,
      organizationId: updated!.organizationId,
      organizationName: updated!.organization?.name ?? null,
      amountCents: updated!.amountCents,
      amountRub: (updated!.amountCents / 100).toFixed(2),
      periodStart: updated!.periodStart.toISOString(),
      periodEnd: updated!.periodEnd.toISOString(),
      status: updated!.status,
      offerNumber: offerNumber ?? null,
      memberLimit: memberLimit ?? null,
    },
  });
}
