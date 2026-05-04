import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PV_APPLICATION_STATUS } from "@/lib/partner-venue-application-status";
import { partnerVenueHasApplicationSlotCap } from "@/lib/partner-venue-slot-cap";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/partner-venues/my-applications/[applicationId]
 * Тело: { "action": "cancel" } — участник отменяет свою заявку (NEW / IN_PROGRESS → CANCELLED).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { applicationId } = await context.params;
    const aid = applicationId?.trim();
    if (!aid) {
      return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
    }

    let body: { action?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
    }

    if (body.action !== "cancel") {
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    const userId = session.user.id;

    const rows = await prisma.$queryRaw<Array<{ venueId: string; status: string }>>(
      Prisma.sql`
        SELECT a."partnerVenueId" AS "venueId", a.status::text AS status
        FROM "PartnerVenueApplication" a
        WHERE a.id = ${aid} AND a."applicantUserId" = ${userId}
        LIMIT 1
      `
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const st = rows[0]!.status;
    const canCancel =
      st === PV_APPLICATION_STATUS.NEW || st === PV_APPLICATION_STATUS.IN_PROGRESS;
    if (!canCancel) {
      return NextResponse.json(
        { error: "Отменить можно только заявку в статусе «Новая» или «В работе»" },
        { status: 400 }
      );
    }

    const venueId = rows[0]!.venueId;

    const venue = await prisma.partnerVenue.findFirst({
      where: { id: venueId },
      select: { id: true, remainingSlots: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
    }

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "PartnerVenueApplication"
        SET status = 'CANCELLED'::"PartnerVenueApplicationStatus"
        WHERE id = ${aid}
          AND "applicantUserId" = ${userId}
          AND status::text IN ('NEW', 'IN_PROGRESS')
      `
    );

    const cap = venue.remainingSlots;
    const usedRows = await prisma.$queryRaw<Array<{ c: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS c
        FROM "PartnerVenueApplication" a
        WHERE a."partnerVenueId" = ${venue.id}
          AND a.status::text IN ('NEW', 'IN_PROGRESS')
      `
    );
    const usedAfter = Number(usedRows[0]?.c ?? 0);
    const remainingApplicationSlots = partnerVenueHasApplicationSlotCap(cap)
      ? Math.max(0, cap - usedAfter)
      : null;

    return NextResponse.json({
      ok: true,
      status: PV_APPLICATION_STATUS.CANCELLED,
      applicationsCount: usedAfter,
      remainingApplicationSlots,
    });
  } catch (e) {
    console.error("[PATCH partner-venues/my-applications/[applicationId]]", e);
    return NextResponse.json({ error: "Не удалось отменить заявку" }, { status: 500 });
  }
}
