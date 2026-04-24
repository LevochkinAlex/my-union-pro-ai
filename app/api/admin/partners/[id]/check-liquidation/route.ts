import { NextRequest, NextResponse } from "next/server";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { partnerHasEgrulLookupKey, runPartnerLiquidationScan } from "@/lib/partner-liquidation-scan";

/**
 * POST /api/admin/partners/[id]/check-liquidation
 * Ручной запуск проверки ЕГРЮЛ для одной карточки партнёра.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const superResult = await ensureSuperAdmin();
  if (superResult.error) return superResult.error;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Не указан id" }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({
    where: { id },
    select: { id: true, inn: true, ogrn: true, name: true },
  });

  if (!partner) {
    return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
  }

  if (!partnerHasEgrulLookupKey(partner.inn, partner.ogrn)) {
    return NextResponse.json(
      { error: "У партнёра нет полного ИНН (10/12 цифр) или ОГРН (13/15 цифр) для запроса в ЕГРЮЛ" },
      { status: 400 }
    );
  }

  const result = await runPartnerLiquidationScan({
    partnerIds: [id],
    triggeredBy: "ADMIN",
    skipEgrulCache: true,
  });

  const after = await prisma.partner.findUnique({
    where: { id },
    select: { moderationStatus: true },
  });
  const partnerIsBlocked = after?.moderationStatus === "BLOCKED";

  return NextResponse.json({
    success: true,
    partnerId: id,
    /** Ручная проверка всегда идёт в ФНС без in-memory кэша клиента (см. skipEgrulCache). */
    egrulFreshRequest: true,
    /** После скана партнёр в BLOCKED (в т.ч. уже был заблокирован и проверка подтвердила). */
    partnerIsBlocked,
    ...result,
    errors: result.errors.slice(0, 10),
  });
}
