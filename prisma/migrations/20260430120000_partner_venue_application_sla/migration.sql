-- SLA 48h: напоминания партнёру и скрытие площадки в каталоге при просроченных заявках NEW
ALTER TABLE "PartnerVenueApplication" ADD COLUMN "slaReminder24hSentAt" TIMESTAMP(3);
ALTER TABLE "PartnerVenueApplication" ADD COLUMN "slaReminder2hSentAt" TIMESTAMP(3);

ALTER TABLE "PartnerVenue" ADD COLUMN "slaOverdueBlockEmailSentAt" TIMESTAMP(3);
