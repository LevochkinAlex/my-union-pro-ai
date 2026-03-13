-- CreateTable
CREATE TABLE "IssuedInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "offerNumber" TEXT NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "memberLimit" INTEGER NOT NULL,
    "tariffLabel" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssuedInvoice_offerNumber_key" ON "IssuedInvoice"("offerNumber");

-- CreateIndex
CREATE INDEX "IssuedInvoice_organizationId_idx" ON "IssuedInvoice"("organizationId");

-- CreateIndex
CREATE INDEX "IssuedInvoice_offerNumber_idx" ON "IssuedInvoice"("offerNumber");

-- CreateIndex
CREATE INDEX "IssuedInvoice_createdAt_idx" ON "IssuedInvoice"("createdAt");

-- AddForeignKey
ALTER TABLE "IssuedInvoice" ADD CONSTRAINT "IssuedInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
