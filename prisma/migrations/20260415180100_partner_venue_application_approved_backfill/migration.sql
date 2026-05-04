-- Отдельная миграция: после COMMIT предыдущей можно безопасно выставить статус APPROVED.
UPDATE "PartnerVenueApplication"
SET status = 'APPROVED'::"PartnerVenueApplicationStatus"
WHERE "paymentConfirmedAt" IS NOT NULL
  AND status::text IN ('NEW', 'IN_PROGRESS');
