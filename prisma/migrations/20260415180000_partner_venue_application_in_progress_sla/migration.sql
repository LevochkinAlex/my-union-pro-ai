-- SLA «В работе»: значение enum APPROVED, колонка inProgressAt, бэкфилл (без UPDATE на APPROVED — см. следующую миграцию: enum в той же транзакции нельзя сразу использовать).
ALTER TYPE "PartnerVenueApplicationStatus" ADD VALUE 'APPROVED';

ALTER TABLE "PartnerVenueApplication" ADD COLUMN IF NOT EXISTS "inProgressAt" TIMESTAMP(3);

UPDATE "PartnerVenueApplication"
SET "inProgressAt" = "createdAt"
WHERE "status"::text = 'IN_PROGRESS'
  AND "inProgressAt" IS NULL;
