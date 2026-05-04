import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type MyApplicationRow = {
  applicationId: string;
  createdAt: Date;
  status: string;
  venueId: string;
  venueName: string;
  city: string | null;
  promoCode: string | null;
  isActive: boolean;
  partnerName: string;
};

/**
 * GET /api/partner-venues/my-applications
 * Площадки, на которые текущий пользователь подал заявку на участие.
 *
 * Через $queryRaw — см. partner/applications (enum IN_PROGRESS в dev).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;

    const rows = await prisma.$queryRaw<MyApplicationRow[]>(
      Prisma.sql`
        SELECT
          a.id AS "applicationId",
          a."createdAt",
          a.status::text AS status,
          v.id AS "venueId",
          v.name AS "venueName",
          v.city,
          v."promoCode",
          v."isActive",
          p.name AS "partnerName"
        FROM "PartnerVenueApplication" a
        INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
        INNER JOIN "Partner" p ON p.id = v."partnerId"
        WHERE a."applicantUserId" = ${userId}
        ORDER BY a."createdAt" DESC
      `
    );

    const venues = rows.map((r) => ({
      id: r.venueId,
      applicationId: r.applicationId,
      name: r.venueName,
      city: r.city,
      promoCode: r.promoCode,
      isActive: r.isActive,
      partnerName: r.partnerName,
      applicationsCount: 1,
      lastAppliedAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
    }));

    return NextResponse.json({ venues });
  } catch (e) {
    console.error("[partner-venues/my-applications] GET:", e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
