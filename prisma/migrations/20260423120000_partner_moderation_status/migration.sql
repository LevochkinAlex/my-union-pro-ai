-- CreateEnum
CREATE TYPE "PartnerModerationStatus" AS ENUM ('DRAFT', 'NEW', 'UNDER_REVIEW', 'APPROVED', 'BLOCKED', 'RETURNED');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN "moderationStatus" "PartnerModerationStatus" NOT NULL DEFAULT 'NEW';

-- Существующие партнёры считаем уже прошедшими проверку (как раньше «Активна» в смысле согласования)
UPDATE "Partner" SET "moderationStatus" = 'APPROVED' WHERE "moderationStatus" = 'NEW';

-- Проиндексировать по статусу
CREATE INDEX "Partner_moderationStatus_idx" ON "Partner"("moderationStatus");
