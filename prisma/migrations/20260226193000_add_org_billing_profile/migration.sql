-- CreateEnum
CREATE TYPE "BillingEntityType" AS ENUM ('INDIVIDUAL', 'INDIVIDUAL_ENTREPRENEUR', 'LEGAL_ENTITY');

-- CreateTable
CREATE TABLE "OrganizationBillingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "BillingEntityType" NOT NULL,
    "fullName" TEXT,
    "companyName" TEXT,
    "inn" TEXT,
    "kpp" TEXT,
    "ogrn" TEXT,
    "legalAddress" TEXT,
    "checkingAccount" TEXT,
    "bankName" TEXT,
    "bik" TEXT,
    "correspondentAccount" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBillingProfile_organizationId_key" ON "OrganizationBillingProfile"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationBillingProfile_organizationId_idx" ON "OrganizationBillingProfile"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationBillingProfile_entityType_idx" ON "OrganizationBillingProfile"("entityType");

-- AddForeignKey
ALTER TABLE "OrganizationBillingProfile" ADD CONSTRAINT "OrganizationBillingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

