-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionBlockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrganizationSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "memberLimit" INTEGER,
    "tariffKey" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "periodEndsAt" TIMESTAMP(3),
    "periodStartedAt" TIMESTAMP(3),
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "addedDaysByAdmin" INTEGER,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_organizationId_idx" ON "OrganizationSubscription"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_status_idx" ON "OrganizationSubscription"("status");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_periodEndsAt_idx" ON "OrganizationSubscription"("periodEndsAt");

-- CreateIndex
CREATE INDEX "OrganizationPayment_organizationId_idx" ON "OrganizationPayment"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationPayment_subscriptionId_idx" ON "OrganizationPayment"("subscriptionId");

-- CreateIndex
CREATE INDEX "OrganizationPayment_createdAt_idx" ON "OrganizationPayment"("createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationPayment" ADD CONSTRAINT "OrganizationPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationPayment" ADD CONSTRAINT "OrganizationPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "OrganizationSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
