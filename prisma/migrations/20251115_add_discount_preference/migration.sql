-- Create table for storing personal discount notification preferences
CREATE TABLE "DiscountPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "filters" JSONB,
    "geolocation" JSONB,
    "lastNotificationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscountPreference_pkey" PRIMARY KEY ("id")
);

-- Ensure each user can have only one preference row
CREATE UNIQUE INDEX "DiscountPreference_userId_key" ON "DiscountPreference"("userId");

-- Fast lookup for users with push enabled
CREATE INDEX "DiscountPreference_pushEnabled_idx" ON "DiscountPreference"("pushEnabled");

-- Wire preference to user lifecycle
ALTER TABLE "DiscountPreference"
ADD CONSTRAINT "DiscountPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

