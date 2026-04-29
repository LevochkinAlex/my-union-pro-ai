import type { PrismaClient } from "@prisma/client";
import {
  isPartnerVenueParticipationValue,
  type PartnerVenueParticipationValue,
} from "@/lib/partner-venue-participation";

/**
 * Записывает `participationMode` напрямую в PostgreSQL, минуя DMMF сгенерированного клиента
 * (иначе после `prisma generate` без перезапуска `next dev` возможен Unknown argument `participationMode`).
 */
export async function setPartnerVenueParticipationModeRaw(
  client: PrismaClient,
  venueId: string,
  mode: PartnerVenueParticipationValue
): Promise<void> {
  if (!venueId || !isPartnerVenueParticipationValue(mode)) return;
  await client.$executeRawUnsafe(
    `UPDATE "PartnerVenue" SET "participationMode" = $1::"PartnerVenueParticipationMode" WHERE id = $2`,
    mode,
    venueId
  );
}

/** Читает актуальное значение из БД (старый Prisma Client может не отдавать колонку в findFirst/findMany). */
export async function getPartnerVenueParticipationModeRaw(
  client: PrismaClient,
  venueId: string
): Promise<PartnerVenueParticipationValue> {
  if (!venueId) return "PROMO_CODE";
  const rows = await client.$queryRawUnsafe<Array<{ participationMode: string }>>(
    `SELECT "participationMode"::text AS "participationMode" FROM "PartnerVenue" WHERE id = $1 LIMIT 1`,
    venueId
  );
  const v = rows[0]?.participationMode;
  return v === "APPLICATION" ? "APPLICATION" : "PROMO_CODE";
}

export async function mergeParticipationModeOnVenue<T extends { id: string }>(
  client: PrismaClient,
  venue: T | null
): Promise<(T & { participationMode: PartnerVenueParticipationValue }) | null> {
  if (!venue) return null;
  const participationMode = await getPartnerVenueParticipationModeRaw(client, venue.id);
  return { ...venue, participationMode };
}

export async function mergeParticipationModesOnVenues<T extends { id: string }>(
  client: PrismaClient,
  venues: T[]
): Promise<Array<T & { participationMode: PartnerVenueParticipationValue }>> {
  if (!venues.length) return venues as Array<T & { participationMode: PartnerVenueParticipationValue }>;
  const uniqueIds = [...new Set(venues.map((v) => v.id))];
  const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await client.$queryRawUnsafe<Array<{ id: string; participationMode: string }>>(
    `SELECT id, "participationMode"::text AS "participationMode" FROM "PartnerVenue" WHERE id IN (${placeholders})`,
    ...uniqueIds
  );
  const map = new Map<string, PartnerVenueParticipationValue>();
  for (const r of rows) {
    map.set(r.id, r.participationMode === "APPLICATION" ? "APPLICATION" : "PROMO_CODE");
  }
  return venues.map((v) => ({
    ...v,
    participationMode: map.get(v.id) ?? "PROMO_CODE",
  }));
}
