import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePartner } from "@/lib/partner-auth";
import { PV_APPLICATION_STATUS } from "@/lib/partner-venue-application-status";
import { partnerVenueHasApplicationSlotCap } from "@/lib/partner-venue-slot-cap";
import { partnerApiPrismaJsonBody } from "@/lib/prisma-partner-list-error-message";

export const dynamic = "force-dynamic";

async function slotCountsAfterUpdate(venueId: string, cap: number | null) {
  const usedRows = await prisma.$queryRaw<Array<{ c: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS c
      FROM "PartnerVenueApplication" a
      WHERE a."partnerVenueId" = ${venueId}
        AND a.status::text IN ('NEW', 'IN_PROGRESS')
    `
  );
  const usedAfter = Number(usedRows[0]?.c ?? 0);
  const remainingApplicationSlots = partnerVenueHasApplicationSlotCap(cap)
    ? Math.max(0, cap - usedAfter)
    : null;
  return { applicationsCount: usedAfter, remainingApplicationSlots };
}

/**
 * PATCH /api/partner/venues/[id]/applications/[applicationId]
 * Тело: { "action": "reject" } — «Новая» / «В работе» → «Отменена».
 *       { "action": "approve" } — «Новая» / «В работе» → «Одобрено» (освобождает слот лимита).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; applicationId: string }> }
) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  const { id: venueId, applicationId } = await context.params;
  if (!venueId?.trim() || !applicationId?.trim()) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "reject" && action !== "approve") {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }

  const vid = venueId.trim();
  const aid = applicationId.trim();

  try {
    const venue = await prisma.partnerVenue.findFirst({
      where: { id: vid, partnerId },
      select: { id: true, remainingSlots: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
    }

    const appRows = await prisma.$queryRaw<Array<{ id: string; status: string }>>(
      Prisma.sql`
        SELECT a.id, a.status::text AS status
        FROM "PartnerVenueApplication" a
        INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
        WHERE a.id = ${aid}
          AND a."partnerVenueId" = ${venue.id}
          AND v."partnerId" = ${partnerId}
        LIMIT 1
      `
    );
    if (appRows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const st = appRows[0]!.status;
    const canMutate =
      st === PV_APPLICATION_STATUS.NEW || st === PV_APPLICATION_STATUS.IN_PROGRESS;
    if (!canMutate) {
      return NextResponse.json(
        { error: "Доступно только для заявок в статусе «Новая» или «В работе»" },
        { status: 400 }
      );
    }

    const cap = venue.remainingSlots;

    if (action === "reject") {
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE "PartnerVenueApplication" a
          SET status = 'CANCELLED'::"PartnerVenueApplicationStatus"
          FROM "PartnerVenue" v
          WHERE a.id = ${aid}
            AND a."partnerVenueId" = ${venue.id}
            AND v.id = a."partnerVenueId"
            AND v."partnerId" = ${partnerId}
            AND a.status::text IN ('NEW', 'IN_PROGRESS')
        `
      );
      const slots = await slotCountsAfterUpdate(venue.id, cap);
      return NextResponse.json({
        ok: true,
        status: PV_APPLICATION_STATUS.CANCELLED,
        ...slots,
      });
    }

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "PartnerVenueApplication" a
        SET status = 'APPROVED'::"PartnerVenueApplicationStatus",
            "inProgressAt" = NULL
        FROM "PartnerVenue" v
        WHERE a.id = ${aid}
          AND a."partnerVenueId" = ${venue.id}
          AND v.id = a."partnerVenueId"
          AND v."partnerId" = ${partnerId}
          AND a.status::text IN ('NEW', 'IN_PROGRESS')
      `
    );
    const slots = await slotCountsAfterUpdate(venue.id, cap);
    return NextResponse.json({
      ok: true,
      status: PV_APPLICATION_STATUS.APPROVED,
      ...slots,
    });
  } catch (e) {
    console.error("[PATCH partner/venues/[id]/applications/[applicationId]]", e);
    return NextResponse.json(
      partnerApiPrismaJsonBody(e, "Не удалось обновить заявку"),
      { status: 500 }
    );
  }
}
