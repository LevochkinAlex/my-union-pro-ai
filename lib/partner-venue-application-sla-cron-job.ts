import { prisma } from "@/lib/prisma";
import {
  sendPartnerVenueApplicationSlaReminder24hEmail,
  sendPartnerVenueApplicationSlaReminder2hEmail,
  sendPartnerVenueSlaBlockedEmail,
  resolvePartnerVenueNotificationEmail,
  type PartnerVenueApplicationEmailContext,
} from "@/lib/partner-venue-application-email";
import {
  partnerVenueSlaOverdueCutoff,
  partnerVenueSlaReminder24hEligibleCutoff,
  partnerVenueSlaReminder2hEligibleCutoff,
} from "@/lib/partner-venue-sla";
import { PartnerVenueApplicationStatus, Prisma } from "@prisma/client";

export type PartnerVenueApplicationSlaCronResult = {
  reminder24h: number;
  reminder2h: number;
  blockEmails: number;
  errors: string[];
};

/**
 * Напоминания партнёру (24 ч и 2 ч до конца 48 ч), письмо о скрытии площадки, сброс флага при снятии блокировки.
 * Вызывается из GET /api/cron/partner-venue-application-sla и scripts/run-partner-venue-sla-cron.ts.
 */
export async function runPartnerVenueApplicationSlaCronJob(
  now: Date = new Date()
): Promise<PartnerVenueApplicationSlaCronResult> {
  const result: PartnerVenueApplicationSlaCronResult = {
    reminder24h: 0,
    reminder2h: 0,
    blockEmails: 0,
    errors: [],
  };

  const overdueCutoff = partnerVenueSlaOverdueCutoff(now);
  const r24Cutoff = partnerVenueSlaReminder24hEligibleCutoff(now);
  const r2Cutoff = partnerVenueSlaReminder2hEligibleCutoff(now);

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "PartnerVenue" v
      SET "slaOverdueBlockEmailSentAt" = NULL
      WHERE v."slaOverdueBlockEmailSentAt" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "PartnerVenueApplication" a
          WHERE a."partnerVenueId" = v.id
            AND a.status::text = 'NEW'
            AND a."createdAt" <= ${overdueCutoff}
        )
    `
  );

  const for24 = await prisma.partnerVenueApplication.findMany({
    where: {
      status: PartnerVenueApplicationStatus.NEW,
      createdAt: { lte: r24Cutoff },
      slaReminder24hSentAt: null,
    },
    select: {
      id: true,
      partnerVenue: {
        select: {
          id: true,
          name: true,
          email: true,
          partner: { select: { email: true, contactEmail: true } },
        },
      },
    },
  });

  for (const row of for24) {
    const v = row.partnerVenue;
    const to = resolvePartnerVenueNotificationEmail({
      email: v.email,
      partner: { contactEmail: v.partner.contactEmail, email: v.partner.email },
    });
    const ctx: PartnerVenueApplicationEmailContext = { venueId: v.id, venueName: v.name };
    if (!to) {
      result.errors.push(`[24h] Нет email партнёра, application ${row.id}`);
      await prisma.partnerVenueApplication.update({
        where: { id: row.id },
        data: { slaReminder24hSentAt: now },
      });
      continue;
    }
    try {
      await sendPartnerVenueApplicationSlaReminder24hEmail(to, ctx);
      await prisma.partnerVenueApplication.update({
        where: { id: row.id },
        data: { slaReminder24hSentAt: now },
      });
      result.reminder24h += 1;
    } catch (e) {
      result.errors.push(`[24h] ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const for2 = await prisma.partnerVenueApplication.findMany({
    where: {
      status: PartnerVenueApplicationStatus.NEW,
      createdAt: { lte: r2Cutoff },
      slaReminder2hSentAt: null,
    },
    select: {
      id: true,
      partnerVenue: {
        select: {
          id: true,
          name: true,
          email: true,
          partner: { select: { email: true, contactEmail: true } },
        },
      },
    },
  });

  for (const row of for2) {
    const v = row.partnerVenue;
    const to = resolvePartnerVenueNotificationEmail({
      email: v.email,
      partner: { contactEmail: v.partner.contactEmail, email: v.partner.email },
    });
    const ctx: PartnerVenueApplicationEmailContext = { venueId: v.id, venueName: v.name };
    if (!to) {
      result.errors.push(`[2h] Нет email партнёра, application ${row.id}`);
      await prisma.partnerVenueApplication.update({
        where: { id: row.id },
        data: { slaReminder2hSentAt: now },
      });
      continue;
    }
    try {
      await sendPartnerVenueApplicationSlaReminder2hEmail(to, ctx);
      await prisma.partnerVenueApplication.update({
        where: { id: row.id },
        data: { slaReminder2hSentAt: now },
      });
      result.reminder2h += 1;
    } catch (e) {
      result.errors.push(`[2h] ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const venuesToBlockNotify = await prisma.partnerVenue.findMany({
    where: {
      slaOverdueBlockEmailSentAt: null,
      applications: {
        some: {
          status: PartnerVenueApplicationStatus.NEW,
          createdAt: { lte: overdueCutoff },
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      partner: { select: { email: true, contactEmail: true } },
    },
  });

  for (const v of venuesToBlockNotify) {
    const to = resolvePartnerVenueNotificationEmail({
      email: v.email,
      partner: { contactEmail: v.partner.contactEmail, email: v.partner.email },
    });
    const ctx: PartnerVenueApplicationEmailContext = { venueId: v.id, venueName: v.name };
    if (!to) {
      result.errors.push(`[block] Нет email партнёра, venue ${v.id}`);
      await prisma.partnerVenue.update({
        where: { id: v.id },
        data: { slaOverdueBlockEmailSentAt: now },
      });
      continue;
    }
    try {
      await sendPartnerVenueSlaBlockedEmail(to, ctx);
      await prisma.partnerVenue.update({
        where: { id: v.id },
        data: { slaOverdueBlockEmailSentAt: now },
      });
      result.blockEmails += 1;
    } catch (e) {
      result.errors.push(`[block] ${v.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
