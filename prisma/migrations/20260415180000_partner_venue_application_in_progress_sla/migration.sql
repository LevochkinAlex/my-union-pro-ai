-- SLA 72h after IN_PROGRESS: статус «Одобрено», момент входа «В работе», бэкфилл
ALTER TYPE "PartnerVenueApplicationStatus" ADD VALUE 'APPROVED';

ALTER TABLE "PartnerVenueApplication" ADD COLUMN IF NOT EXISTS "inProgressAt" TIMESTAMP(3);

UPDATE "PartnerVenueApplication"
SET "inProgressAt" = COALESCE("updatedAt", "createdAt")
WHERE "status"::text = 'IN_PROGRESS'
  AND "inProgressAt" IS NULL;

-- Уже подтверждённая оплата → статус «Одобрено»
UPDATE "PartnerVenueApplication"
SET status = 'APPROVED'::"PartnerVenueApplicationStatus"
WHERE "paymentConfirmedAt" IS NOT NULL
  AND status::text IN ('NEW', 'IN_PROGRESS');
