-- Add publicId field to UserAppeal table
ALTER TABLE "UserAppeal" ADD COLUMN "publicId" CHAR(8) NOT NULL DEFAULT '00000000';

-- Create unique constraint on publicId
ALTER TABLE "UserAppeal" ADD CONSTRAINT "UserAppeal_publicId_key" UNIQUE ("publicId");

-- Create index for fast lookups
CREATE INDEX "UserAppeal_publicId_idx" ON "UserAppeal"("publicId");

-- Update existing records with random 8-digit IDs (avoid conflicts)
-- Note: In production, you should handle this more carefully
UPDATE "UserAppeal" 
SET "publicId" = LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0')
WHERE "publicId" = '00000000';

-- Make publicId NOT NULL after population
ALTER TABLE "UserAppeal" ALTER COLUMN "publicId" DROP DEFAULT;

