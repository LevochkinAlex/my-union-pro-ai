import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** Полный срок реакции партнёра на заявку в статусе NEW (часы) */
export const PARTNER_VENUE_APPLICATION_SLA_HOURS = 48;

/** Через столько часов после подачи — первое напоминание (за 24 ч до конца SLA) */
export const PARTNER_VENUE_SLA_FIRST_REMINDER_AFTER_HOURS = 24;

/** Через столько часов после подачи — второе напоминание (за 2 ч до конца SLA) */
export const PARTNER_VENUE_SLA_SECOND_REMINDER_AFTER_HOURS = 46;

function hoursAgo(hours: number, now: Date): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/** Заявки NEW старше этого момента считаются просроченными по SLA (площадку скрываем в каталоге). */
export function partnerVenueSlaOverdueCutoff(now: Date = new Date()): Date {
  return hoursAgo(PARTNER_VENUE_APPLICATION_SLA_HOURS, now);
}

export function partnerVenueSlaReminder24hEligibleCutoff(now: Date = new Date()): Date {
  return hoursAgo(PARTNER_VENUE_SLA_FIRST_REMINDER_AFTER_HOURS, now);
}

export function partnerVenueSlaReminder2hEligibleCutoff(now: Date = new Date()): Date {
  return hoursAgo(PARTNER_VENUE_SLA_SECOND_REMINDER_AFTER_HOURS, now);
}

export function partnerVenueApplicationsManageUrl(venueId: string): string {
  const base = (process.env.NEXTAUTH_URL ?? "https://myunion.pro").replace(/\/$/, "");
  return `${base}/partner-dashboard/applications/${encodeURIComponent(venueId)}`;
}

/** ID площадок, у которых есть хотя бы одна заявка NEW с истёкшим SLA (скрыть из каталога «Скидки от партнёров»). */
export async function getPartnerVenueIdsSlaOverdueFromCatalog(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<string[]> {
  const cutoff = partnerVenueSlaOverdueCutoff(now);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT DISTINCT v.id
      FROM "PartnerVenue" v
      INNER JOIN "PartnerVenueApplication" a ON a."partnerVenueId" = v.id
      WHERE a.status::text = 'NEW'
        AND a."createdAt" <= ${cutoff}
    `
  );
  return rows.map((r) => r.id);
}

/** У площадки есть просроченные NEW — нельзя подавать новые заявки с каталога. */
export async function partnerVenueHasSlaOverdueNewApplications(
  prisma: PrismaClient,
  partnerVenueId: string,
  now: Date = new Date()
): Promise<boolean> {
  const cutoff = partnerVenueSlaOverdueCutoff(now);
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS c
      FROM "PartnerVenueApplication" a
      WHERE a."partnerVenueId" = ${partnerVenueId}
        AND a.status::text = 'NEW'
        AND a."createdAt" <= ${cutoff}
    `
  );
  return Number(rows[0]?.c ?? 0) > 0;
}
