import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PV_APPLICATION_STATUS } from "@/lib/partner-venue-application-status";
import { prisma } from "@/lib/prisma";
import { partnerApiPrismaJsonBody } from "@/lib/prisma-partner-list-error-message";

export const dynamic = "force-dynamic";

type ApplicationRow = {
  applicationId: string;
  createdAt: Date;
  status: string;
  venueId: string;
  venueName: string;
  city: string | null;
  promoCode: string | null;
  isActive: boolean;
};

/**
 * GET /api/partner/applications
 * Площадки партнёра, по которым есть хотя бы одна заявка на участие.
 *
 * Данные через $queryRaw: в dev Prisma Engine иногда не знает новые значения enum (например IN_PROGRESS),
 * тогда findMany падает при чтении строк из БД.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, partnerRecordId: true },
    });

    if (!user || user.role !== "PARTNER" || !user.partnerRecordId) {
      return NextResponse.json({ error: "Доступно только партнёрам" }, { status: 403 });
    }

    const partnerId = user.partnerRecordId;

    const rows = await prisma.$queryRaw<ApplicationRow[]>(
      Prisma.sql`
        SELECT
          a.id AS "applicationId",
          a."createdAt",
          a.status::text AS status,
          v.id AS "venueId",
          v.name AS "venueName",
          v.city,
          v."promoCode",
          v."isActive"
        FROM "PartnerVenueApplication" a
        INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
        WHERE v."partnerId" = ${partnerId}
        ORDER BY a."createdAt" DESC
      `
    );

    const byVenue = new Map<
      string,
      {
        id: string;
        name: string;
        city: string | null;
        promoCode: string | null;
        isActive: boolean;
        applicationsCount: number;
        lastAppliedAt: string;
      }
    >();

    for (const row of rows) {
      const v = {
        id: row.venueId,
        name: row.venueName,
        city: row.city,
        promoCode: row.promoCode,
        isActive: row.isActive,
      };
      const existing = byVenue.get(v.id);
      const iso = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
      const occupiesSlot =
        row.status !== PV_APPLICATION_STATUS.CANCELLED &&
        row.status !== PV_APPLICATION_STATUS.APPROVED;
      if (!existing) {
        byVenue.set(v.id, {
          id: v.id,
          name: v.name,
          city: v.city,
          promoCode: v.promoCode,
          isActive: v.isActive,
          applicationsCount: occupiesSlot ? 1 : 0,
          lastAppliedAt: iso,
        });
      } else {
        if (occupiesSlot) existing.applicationsCount += 1;
        if (new Date(iso) > new Date(existing.lastAppliedAt)) {
          existing.lastAppliedAt = iso;
        }
      }
    }

    const venues = Array.from(byVenue.values()).sort((a, b) =>
      b.lastAppliedAt.localeCompare(a.lastAppliedAt)
    );

    return NextResponse.json({ venues });
  } catch (e) {
    console.error("[partner/applications] GET:", e);
    return NextResponse.json(partnerApiPrismaJsonBody(e, "Ошибка загрузки"), { status: 500 });
  }
}
