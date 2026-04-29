import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ensurePartner } from "@/lib/partner-auth";
import { PV_APPLICATION_STATUS } from "@/lib/partner-venue-application-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/partner/applications/new-count
 * Число заявок со статусом «Новая» по всем площадкам текущего партнёра (для бейджа в меню).
 *
 * Считаем через $queryRaw: так не зависим от устаревшего singleton PrismaClient в dev
 * (после добавления поля `status` в схему `count({ where: { status } })` давал PrismaClientValidationError).
 */
export async function GET() {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;

  const partnerId = auth.partner!.id;

  try {
    const rows = await prisma.$queryRaw<Array<{ c: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS c
        FROM "PartnerVenueApplication" a
        INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
        WHERE v."partnerId" = ${partnerId}
          AND a."status"::text = ${PV_APPLICATION_STATUS.NEW}
      `
    );
    const n = Number(rows[0]?.c ?? 0);
    return NextResponse.json({ count: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 });
  } catch (e) {
    console.error("[partner/applications/new-count] GET:", e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
