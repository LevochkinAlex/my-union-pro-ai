-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "moderationApprovedAt" TIMESTAMP(3);

-- Ранее миграция выставила всем APPROVED без явного одобрения в UI; без даты одобрения возвращаем в «На проверке»
UPDATE "Partner"
SET "moderationStatus" = 'UNDER_REVIEW', "moderationApprovedAt" = NULL
WHERE "moderationStatus" = 'APPROVED' AND "moderationApprovedAt" IS NULL;
