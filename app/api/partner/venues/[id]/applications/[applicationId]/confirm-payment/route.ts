import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePartner } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

/**
 * POST — партнёр подтверждает получение документов об оплате (есть хотя бы один загруженный файл).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; applicationId: string }> }
) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  const { id: venueId, applicationId } = await context.params;
  const vid = venueId?.trim();
  const aid = applicationId?.trim();
  if (!vid || !aid) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  const venue = await prisma.partnerVenue.findFirst({
    where: { id: vid, partnerId },
    select: { id: true },
  });
  if (!venue) {
    return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
  }

  const applicationRows = await prisma.$queryRaw<
    Array<{ id: string; status: string; paymentConfirmedAt: Date | null; docCount: bigint }>
  >(
    Prisma.sql`
      SELECT a.id, a.status::text AS status, a."paymentConfirmedAt",
        (SELECT COUNT(*)::bigint FROM "PartnerVenueApplicationPaymentDocument" d WHERE d."partnerVenueApplicationId" = a.id) AS "docCount"
      FROM "PartnerVenueApplication" a
      WHERE a.id = ${aid} AND a."partnerVenueId" = ${venue.id}
      LIMIT 1
    `
  );
  const application = applicationRows[0];
  if (!application) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }

  if (application.status !== "NEW" && application.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: "Подтвердить оплату можно только по заявке в статусе «Новая» или «В работе»" },
      { status: 400 }
    );
  }

  if (Number(application.docCount ?? 0) < 1) {
    return NextResponse.json(
      { error: "Нет загруженных документов об оплате от участника" },
      { status: 400 }
    );
  }

  if (application.paymentConfirmedAt) {
    return NextResponse.json({
      ok: true,
      status: "APPROVED",
      paymentConfirmedAt: application.paymentConfirmedAt.toISOString(),
      alreadyConfirmed: true,
    });
  }

  const updated = await prisma.$queryRaw<Array<{ paymentConfirmedAt: Date | null }>>(
    Prisma.sql`
      UPDATE "PartnerVenueApplication"
      SET status = 'APPROVED'::"PartnerVenueApplicationStatus",
          "paymentConfirmedAt" = NOW()
      WHERE id = ${application.id}
        AND "partnerVenueId" = ${venue.id}
        AND status::text IN ('NEW', 'IN_PROGRESS')
      RETURNING "paymentConfirmedAt"
    `
  );

  const row = updated[0];
  if (!row?.paymentConfirmedAt) {
    return NextResponse.json({ error: "Не удалось подтвердить оплату" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    status: "APPROVED",
    paymentConfirmedAt: row.paymentConfirmedAt.toISOString(),
  });
}
