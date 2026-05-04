import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** Заявки, занимающие слот: «Новая» и «В работе» (только SQL, без enum в Prisma Client). */
export async function countOccupyingApplicationsRaw(
  prisma: PrismaClient,
  partnerVenueId: string
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS c
      FROM "PartnerVenueApplication"
      WHERE "partnerVenueId" = ${partnerVenueId}
        AND status::text IN ('NEW', 'IN_PROGRESS')
    `
  );
  return Number(rows[0]?.c ?? 0);
}

export async function getApplicationByVenueAndApplicantRaw(
  prisma: PrismaClient,
  partnerVenueId: string,
  applicantUserId: string
): Promise<{ id: string; status: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>(
    Prisma.sql`
      SELECT id, status::text AS status
      FROM "PartnerVenueApplication"
      WHERE "partnerVenueId" = ${partnerVenueId}
        AND "applicantUserId" = ${applicantUserId}
      LIMIT 1
    `
  );
  return rows[0] ?? null;
}

/** Количество «занимающих слот» заявок по списку площадок. */
export async function countOccupyingByVenueIdsRaw(
  prisma: PrismaClient,
  venueIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (venueIds.length === 0) return map;

  const rows = await prisma.$queryRaw<Array<{ partnerVenueId: string; c: bigint }>>(
    Prisma.sql`
      SELECT a."partnerVenueId", COUNT(*)::bigint AS c
      FROM "PartnerVenueApplication" a
      WHERE a."partnerVenueId" IN (${Prisma.join(venueIds)})
        AND a.status::text IN ('NEW', 'IN_PROGRESS')
      GROUP BY a."partnerVenueId"
    `
  );
  for (const row of rows) {
    map.set(row.partnerVenueId, Number(row.c));
  }
  return map;
}
