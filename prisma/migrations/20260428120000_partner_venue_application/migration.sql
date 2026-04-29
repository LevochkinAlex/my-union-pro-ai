-- CreateTable
CREATE TABLE "PartnerVenueApplication" (
    "id" TEXT NOT NULL,
    "partnerVenueId" TEXT NOT NULL,
    "applicantUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerVenueApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerVenueApplication_partnerVenueId_applicantUserId_key" ON "PartnerVenueApplication"("partnerVenueId", "applicantUserId");

-- CreateIndex
CREATE INDEX "PartnerVenueApplication_partnerVenueId_idx" ON "PartnerVenueApplication"("partnerVenueId");

-- CreateIndex
CREATE INDEX "PartnerVenueApplication_applicantUserId_idx" ON "PartnerVenueApplication"("applicantUserId");

-- CreateIndex
CREATE INDEX "PartnerVenueApplication_createdAt_idx" ON "PartnerVenueApplication"("createdAt");

-- AddForeignKey
ALTER TABLE "PartnerVenueApplication" ADD CONSTRAINT "PartnerVenueApplication_partnerVenueId_fkey" FOREIGN KEY ("partnerVenueId") REFERENCES "PartnerVenue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerVenueApplication" ADD CONSTRAINT "PartnerVenueApplication_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
