-- AlterTable
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "linkedUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Partner_linkedUserId_idx" ON "Partner"("linkedUserId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Partner_linkedUserId_fkey'
  ) THEN
    ALTER TABLE "Partner" ADD CONSTRAINT "Partner_linkedUserId_fkey"
      FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
