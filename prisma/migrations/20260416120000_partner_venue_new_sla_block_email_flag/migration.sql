-- Отдельный флаг письма о блокировке по просроченным заявкам «Новая» (48 ч)
ALTER TABLE "PartnerVenue" ADD COLUMN IF NOT EXISTS "slaOverdueNewBlockEmailSentAt" TIMESTAMP(3);
