-- Документы об оплате по заявке + отметка подтверждения партнёром
ALTER TABLE "PartnerVenueApplication" ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3);

CREATE TABLE "PartnerVenueApplicationPaymentDocument" (
    "id" TEXT NOT NULL,
    "partnerVenueApplicationId" TEXT NOT NULL,
    "storedFileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerVenueApplicationPaymentDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerVenueApplicationPaymentDocument_partnerVenueApplicationId_idx" ON "PartnerVenueApplicationPaymentDocument"("partnerVenueApplicationId");

CREATE INDEX "PartnerVenueApplicationPaymentDocument_createdAt_idx" ON "PartnerVenueApplicationPaymentDocument"("createdAt");

ALTER TABLE "PartnerVenueApplicationPaymentDocument" ADD CONSTRAINT "PartnerVenueApplicationPaymentDocument_partnerVenueApplicationId_fkey" FOREIGN KEY ("partnerVenueApplicationId") REFERENCES "PartnerVenueApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
