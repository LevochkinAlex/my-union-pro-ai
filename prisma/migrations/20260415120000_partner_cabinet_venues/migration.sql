-- Роль PARTNER
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PARTNER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')) THEN
    ALTER TYPE "UserRole" ADD VALUE 'PARTNER';
  END IF;
END $$;

-- User.partnerRecordId → Partner.id
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "partnerRecordId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_partnerRecordId_key" ON "User"("partnerRecordId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_partnerRecordId_fkey') THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_partnerRecordId_fkey"
      FOREIGN KEY ("partnerRecordId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- PartnerVenue
CREATE TABLE IF NOT EXISTS "PartnerVenue" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bannerUrl" TEXT,
    "bannerAlt" TEXT,
    "promoCode" TEXT,
    "promoLabel" TEXT,
    "conditions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerVenue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PartnerVenue_partnerId_idx" ON "PartnerVenue"("partnerId");
CREATE INDEX IF NOT EXISTS "PartnerVenue_isActive_idx" ON "PartnerVenue"("isActive");
CREATE INDEX IF NOT EXISTS "PartnerVenue_city_idx" ON "PartnerVenue"("city");
CREATE INDEX IF NOT EXISTS "PartnerVenue_createdAt_idx" ON "PartnerVenue"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerVenue_partnerId_fkey') THEN
    ALTER TABLE "PartnerVenue"
      ADD CONSTRAINT "PartnerVenue_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
