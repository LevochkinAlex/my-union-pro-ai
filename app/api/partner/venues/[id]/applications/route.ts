import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePartner } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

type ApplicationApplicantRow = {
  applicationId: string;
  createdAt: Date;
  status: string;
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
};

/**
 * GET /api/partner/venues/[id]/applications
 * Участники, подавшие заявку на площадку (только владелец площадки).
 *
 * Заявки через $queryRaw: движок Prisma в dev может не знать новые значения enum (IN_PROGRESS) при findMany.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await ensurePartner();
  if (auth.error) return auth.error;
  const { id: partnerId } = auth.partner!;

  const { id: venueId } = await context.params;
  if (!venueId?.trim()) {
    return NextResponse.json({ error: "Не указана площадка" }, { status: 400 });
  }

  try {
    const venue = await prisma.partnerVenue.findFirst({
      where: { id: venueId.trim(), partnerId },
      select: { id: true, name: true, city: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Площадка не найдена" }, { status: 404 });
    }

    const rows = await prisma.$queryRaw<ApplicationApplicantRow[]>(
      Prisma.sql`
        SELECT
          a.id AS "applicationId",
          a."createdAt",
          a.status::text AS status,
          u.id AS "userId",
          u.email,
          u."firstName",
          u."lastName",
          u."middleName",
          u.phone
        FROM "PartnerVenueApplication" a
        INNER JOIN "User" u ON u.id = a."applicantUserId"
        WHERE a."partnerVenueId" = ${venue.id}
        ORDER BY a."createdAt" DESC
      `
    );

    const applicants = rows.map((r) => ({
      applicationId: r.applicationId,
      appliedAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
      status: r.status,
      user: {
        id: r.userId,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        middleName: r.middleName,
        phone: r.phone,
      },
    }));

    return NextResponse.json({ venue, applicants });
  } catch (e) {
    console.error("[partner/venues/[id]/applications GET]", e);
    return NextResponse.json({ error: "Не удалось загрузить заявки" }, { status: 500 });
  }
}
