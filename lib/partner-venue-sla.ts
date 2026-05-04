import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** 48 ч: партнёр должен открыть заявку («Новая» → «В работе») */
export const PARTNER_VENUE_APPLICATION_NEW_SLA_MS = 48 * 60 * 60 * 1000;
export const PARTNER_VENUE_APPLICATION_NEW_SLA_HOURS = 48;
/** За 24 ч до конца срока NEW (24 ч после подачи) */
export const PARTNER_VENUE_APPLICATION_NEW_SLA_REMINDER_24H_OFFSET_MS =
  PARTNER_VENUE_APPLICATION_NEW_SLA_MS - 24 * 60 * 60 * 1000;
/** За 2 ч до конца срока NEW (46 ч после подачи) */
export const PARTNER_VENUE_APPLICATION_NEW_SLA_REMINDER_2H_OFFSET_MS =
  PARTNER_VENUE_APPLICATION_NEW_SLA_MS - 2 * 60 * 60 * 1000;

/** 72 ч на реакцию после перевода заявки в «В работе» */
export const PARTNER_VENUE_APPLICATION_SLA_MS = 72 * 60 * 60 * 1000;
export const PARTNER_VENUE_APPLICATION_SLA_HOURS = 72;
/** Напоминание за 24 ч до конца срока «В работе» (48 ч после inProgressAt) */
export const PARTNER_VENUE_APPLICATION_SLA_REMINDER_24H_OFFSET_MS =
  PARTNER_VENUE_APPLICATION_SLA_MS - 24 * 60 * 60 * 1000;

/** ЛК партнёра: заявки по конкретной площадке (управление). */
export function partnerVenueApplicationsManageUrl(venueId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/partner-dashboard/applications/${venueId}`;
}

type FromCatalogRow = { partnerVenueId: string };

/** Площадки с просроченными «Новая» (48 ч с createdAt), только режим «По заявке». */
export async function getPartnerVenueIdsWithSlaOverdueNewApplications(): Promise<string[]> {
  const cutoff = new Date(Date.now() - PARTNER_VENUE_APPLICATION_NEW_SLA_MS);
  const rows = await prisma.$queryRaw<FromCatalogRow[]>(
    Prisma.sql`
      SELECT DISTINCT a."partnerVenueId" AS "partnerVenueId"
      FROM "PartnerVenueApplication" a
      INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
      WHERE v."participationMode" = 'APPLICATION'::"PartnerVenueParticipationMode"
        AND a."status" = 'NEW'::"PartnerVenueApplicationStatus"
        AND a."createdAt" <= ${cutoff}
    `
  );
  return rows.map((r) => r.partnerVenueId);
}

/** Площадки с просроченными «В работе» (72 ч с inProgressAt), только режим «По заявке». */
export async function getPartnerVenueIdsWithSlaOverdueInProgressApplications(): Promise<
  string[]
> {
  const cutoff = new Date(Date.now() - PARTNER_VENUE_APPLICATION_SLA_MS);
  const rows = await prisma.$queryRaw<FromCatalogRow[]>(
    Prisma.sql`
      SELECT DISTINCT a."partnerVenueId" AS "partnerVenueId"
      FROM "PartnerVenueApplication" a
      INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
      WHERE v."participationMode" = 'APPLICATION'::"PartnerVenueParticipationMode"
        AND a."status" = 'IN_PROGRESS'::"PartnerVenueApplicationStatus"
        AND a."inProgressAt" IS NOT NULL
        AND a."inProgressAt" <= ${cutoff}
    `
  );
  return rows.map((r) => r.partnerVenueId);
}

/** Скрыть из каталога при просрочке «Новая» или «В работе» (только площадки с режимом «По заявке»). */
export async function getPartnerVenueIdsSlaOverdueFromCatalog(): Promise<string[]> {
  const [newIds, ipIds] = await Promise.all([
    getPartnerVenueIdsWithSlaOverdueNewApplications(),
    getPartnerVenueIdsWithSlaOverdueInProgressApplications(),
  ]);
  return [...new Set([...newIds, ...ipIds])];
}

export async function partnerVenueHasSlaOverdueNewApplications(
  partnerVenueId: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - PARTNER_VENUE_APPLICATION_NEW_SLA_MS);
  const row = await prisma.$queryRaw<{ ok: bigint }[]>(
    Prisma.sql`
      SELECT 1::bigint AS ok
      FROM "PartnerVenueApplication" a
      INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
      WHERE a."partnerVenueId" = ${partnerVenueId}
        AND v."participationMode" = 'APPLICATION'::"PartnerVenueParticipationMode"
        AND a."status" = 'NEW'::"PartnerVenueApplicationStatus"
        AND a."createdAt" <= ${cutoff}
      LIMIT 1
    `
  );
  return row.length > 0;
}

export async function partnerVenueHasSlaOverdueInProgressApplications(
  partnerVenueId: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - PARTNER_VENUE_APPLICATION_SLA_MS);
  const row = await prisma.$queryRaw<{ ok: bigint }[]>(
    Prisma.sql`
      SELECT 1::bigint AS ok
      FROM "PartnerVenueApplication" a
      INNER JOIN "PartnerVenue" v ON v.id = a."partnerVenueId"
      WHERE a."partnerVenueId" = ${partnerVenueId}
        AND v."participationMode" = 'APPLICATION'::"PartnerVenueParticipationMode"
        AND a."status" = 'IN_PROGRESS'::"PartnerVenueApplicationStatus"
        AND a."inProgressAt" IS NOT NULL
        AND a."inProgressAt" <= ${cutoff}
      LIMIT 1
    `
  );
  return row.length > 0;
}

/** Блок подачи новой заявки / скрытие в каталоге по любому из SLA. */
export async function partnerVenueHasSlaCatalogBlock(partnerVenueId: string): Promise<boolean> {
  const [n, i] = await Promise.all([
    partnerVenueHasSlaOverdueNewApplications(partnerVenueId),
    partnerVenueHasSlaOverdueInProgressApplications(partnerVenueId),
  ]);
  return n || i;
}
