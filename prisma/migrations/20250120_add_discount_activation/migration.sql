-- Create table for storing activated discounts with promo codes and expiration dates
CREATE TABLE "DiscountActivation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discountId" INTEGER NOT NULL,
    "promoCode" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "syncedFromBB" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscountActivation_pkey" PRIMARY KEY ("id")
);

-- Ensure each user can activate a discount only once
CREATE UNIQUE INDEX "DiscountActivation_userId_discountId_key" ON "DiscountActivation"("userId", "discountId");

-- Fast lookup for user's activated discounts
CREATE INDEX "DiscountActivation_userId_idx" ON "DiscountActivation"("userId");

-- Fast lookup for expired discounts
CREATE INDEX "DiscountActivation_validUntil_idx" ON "DiscountActivation"("validUntil");

-- Fast lookup for discount ID
CREATE INDEX "DiscountActivation_discountId_idx" ON "DiscountActivation"("discountId");

-- Wire activation to user lifecycle
ALTER TABLE "DiscountActivation"
ADD CONSTRAINT "DiscountActivation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

