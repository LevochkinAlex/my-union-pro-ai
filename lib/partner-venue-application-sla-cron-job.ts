import {
  sendPartnerVenueApplicationSla24hReminderEmail,
  sendPartnerVenueApplicationSlaBlockEmail,
  sendPartnerVenueApplicationSlaNew24hReminderEmail,
  sendPartnerVenueApplicationSlaNew2hReminderEmail,
  sendPartnerVenueApplicationSlaNewBlockEmail,
} from "@/lib/partner-venue-application-email";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getPartnerVenueIdsWithSlaOverdueInProgressApplications,
  getPartnerVenueIdsWithSlaOverdueNewApplications,
  PARTNER_VENUE_APPLICATION_NEW_SLA_MS,
  PARTNER_VENUE_APPLICATION_NEW_SLA_REMINDER_24H_OFFSET_MS,
  PARTNER_VENUE_APPLICATION_NEW_SLA_REMINDER_2H_OFFSET_MS,
  PARTNER_VENUE_APPLICATION_SLA_MS,
  PARTNER_VENUE_APPLICATION_SLA_REMINDER_24H_OFFSET_MS,
} from "@/lib/partner-venue-sla";

/**
 * Два независимых SLA:
 * - «Новая»: 48 ч с подачи (createdAt); напоминания за 24 ч и 2 ч; отдельное письмо о блокировке (slaOverdueNewBlockEmailSentAt).
 * - «В работе»: 72 ч с inProgressAt; напоминание за 24 ч; отдельное письмо (slaOverdueBlockEmailSentAt).
 * Учитываются только площадки с participationMode = APPLICATION. Флаги писем сбрасываются отдельно.
 */
export async function runPartnerVenueApplicationSlaCronJob(): Promise<{
  newReminder24hSent: number;
  newReminder2hSent: number;
  inProgressReminder24hSent: number;
  newBlockEmailsSent: number;
  inProgressBlockEmailsSent: number;
  errors: number;
}> {
  const now = Date.now();
  const newReminder24Cutoff = new Date(now - PARTNER_VENUE_APPLICATION_NEW_SLA_REMINDER_24H_OFFSET_MS);
  const newReminder2Cutoff = new Date(now - PARTNER_VENUE_APPLICATION_NEW_SLA_REMINDER_2H_OFFSET_MS);
  const ipReminderCutoff = new Date(now - PARTNER_VENUE_APPLICATION_SLA_REMINDER_24H_OFFSET_MS);
  const newOverdueCutoff = new Date(now - PARTNER_VENUE_APPLICATION_NEW_SLA_MS);
  const ipOverdueCutoff = new Date(now - PARTNER_VENUE_APPLICATION_SLA_MS);

  let newReminder24hSent = 0;
  let newReminder2hSent = 0;
  let inProgressReminder24hSent = 0;
  let newBlockEmailsSent = 0;
  let inProgressBlockEmailsSent = 0;
  let errors = 0;

  const dueNew24 = await prisma.partnerVenueApplication.findMany({
    where: {
      status: "NEW",
      createdAt: { lte: newReminder24Cutoff },
      slaReminder24hSentAt: null,
      partnerVenue: { participationMode: "APPLICATION" },
    },
    include: {
      applicant: { select: { firstName: true, lastName: true, middleName: true } },
      partnerVenue: { include: { partner: true } },
    },
  });

  for (const app of dueNew24) {
    const emailTo = app.partnerVenue.partner.contactEmail?.trim();
    if (!emailTo) continue;
    try {
      await sendPartnerVenueApplicationSlaNew24hReminderEmail({
        to: emailTo,
        venueName: app.partnerVenue.name,
        venueId: app.partnerVenueId,
        participantName: `${app.applicant.lastName ?? ""} ${app.applicant.firstName ?? ""} ${app.applicant.middleName ?? ""}`.trim(),
      });
      await prisma.partnerVenueApplication.update({
        where: { id: app.id },
        data: { slaReminder24hSentAt: new Date() },
      });
      newReminder24hSent++;
    } catch {
      errors++;
    }
  }

  const dueNew2 = await prisma.partnerVenueApplication.findMany({
    where: {
      status: "NEW",
      createdAt: { lte: newReminder2Cutoff },
      slaReminder2hSentAt: null,
      partnerVenue: { participationMode: "APPLICATION" },
    },
    include: {
      applicant: { select: { firstName: true, lastName: true, middleName: true } },
      partnerVenue: { include: { partner: true } },
    },
  });

  for (const app of dueNew2) {
    const emailTo = app.partnerVenue.partner.contactEmail?.trim();
    if (!emailTo) continue;
    try {
      await sendPartnerVenueApplicationSlaNew2hReminderEmail({
        to: emailTo,
        venueName: app.partnerVenue.name,
        venueId: app.partnerVenueId,
        participantName: `${app.applicant.lastName ?? ""} ${app.applicant.firstName ?? ""} ${app.applicant.middleName ?? ""}`.trim(),
      });
      await prisma.partnerVenueApplication.update({
        where: { id: app.id },
        data: { slaReminder2hSentAt: new Date() },
      });
      newReminder2hSent++;
    } catch {
      errors++;
    }
  }

  const dueIp24 = await prisma.partnerVenueApplication.findMany({
    where: {
      status: "IN_PROGRESS",
      inProgressAt: { not: null, lte: ipReminderCutoff },
      slaReminder24hSentAt: null,
      partnerVenue: { participationMode: "APPLICATION" },
    },
    include: {
      applicant: { select: { firstName: true, lastName: true, middleName: true } },
      partnerVenue: { include: { partner: true } },
    },
  });

  for (const app of dueIp24) {
    const emailTo = app.partnerVenue.partner.contactEmail?.trim();
    if (!emailTo) continue;
    try {
      await sendPartnerVenueApplicationSla24hReminderEmail({
        to: emailTo,
        venueName: app.partnerVenue.name,
        venueId: app.partnerVenueId,
        participantName: `${app.applicant.lastName ?? ""} ${app.applicant.firstName ?? ""} ${app.applicant.middleName ?? ""}`.trim(),
      });
      await prisma.partnerVenueApplication.update({
        where: { id: app.id },
        data: { slaReminder24hSentAt: new Date() },
      });
      inProgressReminder24hSent++;
    } catch {
      errors++;
    }
  }

  try {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "PartnerVenue" v
        SET "slaOverdueNewBlockEmailSentAt" = NULL
        WHERE v."slaOverdueNewBlockEmailSentAt" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "PartnerVenueApplication" a
            INNER JOIN "PartnerVenue" v2 ON v2.id = a."partnerVenueId"
            WHERE a."partnerVenueId" = v.id
              AND v2."participationMode" = 'APPLICATION'::"PartnerVenueParticipationMode"
              AND a."status" = 'NEW'::"PartnerVenueApplicationStatus"
              AND a."createdAt" <= ${newOverdueCutoff}
          )
      `
    );
  } catch {
    errors++;
  }

  try {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "PartnerVenue" v
        SET "slaOverdueBlockEmailSentAt" = NULL
        WHERE v."slaOverdueBlockEmailSentAt" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "PartnerVenueApplication" a
            INNER JOIN "PartnerVenue" v2 ON v2.id = a."partnerVenueId"
            WHERE a."partnerVenueId" = v.id
              AND v2."participationMode" = 'APPLICATION'::"PartnerVenueParticipationMode"
              AND a."status" = 'IN_PROGRESS'::"PartnerVenueApplicationStatus"
              AND a."inProgressAt" IS NOT NULL
              AND a."inProgressAt" <= ${ipOverdueCutoff}
          )
      `
    );
  } catch {
    errors++;
  }

  const newOverdueVenueIds = await getPartnerVenueIdsWithSlaOverdueNewApplications();
  for (const vid of newOverdueVenueIds) {
    const venue = await prisma.partnerVenue.findFirst({
      where: { id: vid },
      include: { partner: true },
    });
    if (!venue) continue;
    if (venue.slaOverdueNewBlockEmailSentAt != null) continue;
    const emailTo = venue.partner.contactEmail?.trim();
    if (!emailTo) {
      errors++;
      continue;
    }
    try {
      await sendPartnerVenueApplicationSlaNewBlockEmail({ to: emailTo, venueId: venue.id });
      await prisma.partnerVenue.update({
        where: { id: venue.id },
        data: { slaOverdueNewBlockEmailSentAt: new Date() },
      });
      newBlockEmailsSent++;
    } catch {
      errors++;
    }
  }

  const ipOverdueVenueIds = await getPartnerVenueIdsWithSlaOverdueInProgressApplications();
  for (const vid of ipOverdueVenueIds) {
    const venue = await prisma.partnerVenue.findFirst({
      where: { id: vid },
      include: { partner: true },
    });
    if (!venue) continue;
    if (venue.slaOverdueBlockEmailSentAt != null) continue;
    const emailTo = venue.partner.contactEmail?.trim();
    if (!emailTo) {
      errors++;
      continue;
    }
    try {
      await sendPartnerVenueApplicationSlaBlockEmail({ to: emailTo, venueId: venue.id });
      await prisma.partnerVenue.update({
        where: { id: venue.id },
        data: { slaOverdueBlockEmailSentAt: new Date() },
      });
      inProgressBlockEmailsSent++;
    } catch {
      errors++;
    }
  }

  return {
    newReminder24hSent,
    newReminder2hSent,
    inProgressReminder24hSent,
    newBlockEmailsSent,
    inProgressBlockEmailsSent,
    errors,
  };
}
