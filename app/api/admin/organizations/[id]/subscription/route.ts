import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateOrgSubscription,
  effectiveMemberLimit,
  countActiveMembers,
  subscriptionDisplayStatus,
  activateTrial,
  applyMemberLimit,
} from "@/lib/subscription";
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
 * GET /api/admin/organizations/[id]/subscription
 * Подписка организации (для суперадмина)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const { id: organizationId } = await params;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
  }

  const sub = await getOrCreateOrgSubscription(organizationId);
  const displayStatus = subscriptionDisplayStatus(sub);
  const limit = effectiveMemberLimit(sub);
  const activeMembers = await countActiveMembers(organizationId);
  const tariff = sub.tariffKey ? getTariffByKey(sub.tariffKey) : null;

  return NextResponse.json({
    subscription: {
      id: sub.id,
      organizationId: sub.organizationId,
      status: displayStatus,
      memberLimit: sub.memberLimit,
      tariffKey: sub.tariffKey,
      tariffLabel: tariff?.label ?? (sub.memberLimit != null ? `До ${sub.memberLimit} участников` : "Безлимит"),
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      periodEndsAt: sub.periodEndsAt?.toISOString() ?? null,
      periodStartedAt: sub.periodStartedAt?.toISOString() ?? null,
      manualOverride: sub.manualOverride,
      addedDaysByAdmin: sub.addedDaysByAdmin,
      adminNote: sub.adminNote,
    },
    usage: {
      effectiveLimit: limit,
      activeMembers,
      isOverLimit: limit != null && activeMembers > limit,
    },
  });
}

/**
 * PATCH /api/admin/organizations/[id]/subscription
 * Управление подпиской вручную: тариф, доп. дни, безлимит, 14 дней теста
 * Body: { action: "set_tariff" | "add_days" | "set_unlimited" | "activate_trial", ... }
 * - set_tariff: { tariffKey, memberLimit?, addDays? }
 * - add_days: { days }
 * - set_unlimited: { addDays? }
 * - activate_trial: {} — 14 дней теста
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const { id: organizationId } = await params;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "").trim();

  const sub = await getOrCreateOrgSubscription(organizationId);

  if (action === "activate_trial") {
    await activateTrial(organizationId);
    const updated = await prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });
    return NextResponse.json({
      success: true,
      subscription: {
        status: updated?.status,
        trialEndsAt: updated?.trialEndsAt?.toISOString() ?? null,
      },
    });
  }

  if (action === "add_days") {
    const days = Math.max(1, Math.min(365 * 2, parseInt(String(body?.days ?? 30), 10) || 30));
    const currentEnd = sub.periodEndsAt ?? sub.trialEndsAt ?? new Date();
    const base = new Date(currentEnd);
    if (base < new Date()) base.setTime(Date.now());
    base.setDate(base.getDate() + days);
    await prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        manualOverride: true,
        addedDaysByAdmin: (sub.addedDaysByAdmin ?? 0) + days,
        periodEndsAt: base,
        periodStartedAt: sub.periodStartedAt ?? new Date(),
        trialEndsAt: null,
        tariffKey: sub.tariffKey,
        memberLimit: sub.memberLimit,
      },
    });
    await applyMemberLimit(organizationId);
    return NextResponse.json({ success: true, addedDays: days, periodEndsAt: base.toISOString() });
  }

  if (action === "set_unlimited") {
    const addDays = Math.max(0, parseInt(String(body?.addDays ?? 365), 10) || 365);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + addDays);
    await prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        manualOverride: true,
        memberLimit: null,
        tariffKey: "UNLIMITED",
        periodStartedAt: now,
        periodEndsAt: periodEnd,
        trialEndsAt: null,
        adminNote: body?.adminNote ?? sub.adminNote,
      },
    });
    await applyMemberLimit(organizationId);
    return NextResponse.json({
      success: true,
      subscription: { memberLimit: null, periodEndsAt: periodEnd.toISOString() },
    });
  }

  if (action === "set_tariff") {
    const tariffKey = String(body?.tariffKey ?? sub.tariffKey ?? "").trim();
    const memberLimit = body?.memberLimit != null ? parseInt(String(body.memberLimit), 10) : null;
    const addDays = body?.addDays != null ? parseInt(String(body.addDays), 10) : 365;

    const plan = tariffKey ? getTariffByKey(tariffKey) : null;
    const limit =
      memberLimit != null
        ? memberLimit
        : plan?.memberLimit ?? null;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + addDays);

    await prisma.organizationSubscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        manualOverride: limit !== (plan?.memberLimit ?? null) || !!body?.addDays,
        memberLimit: limit,
        tariffKey: tariffKey || null,
        periodStartedAt: now,
        periodEndsAt: periodEnd,
        trialEndsAt: null,
        addedDaysByAdmin: body?.addDays ? addDays : sub.addedDaysByAdmin,
        adminNote: body?.adminNote ?? sub.adminNote,
      },
    });
    await applyMemberLimit(organizationId);
    return NextResponse.json({
      success: true,
      subscription: {
        memberLimit: limit,
        tariffKey: tariffKey || null,
        periodEndsAt: periodEnd.toISOString(),
      },
    });
  }

  return NextResponse.json(
    { error: "Укажите action: activate_trial | add_days | set_unlimited | set_tariff" },
    { status: 400 }
  );
}
