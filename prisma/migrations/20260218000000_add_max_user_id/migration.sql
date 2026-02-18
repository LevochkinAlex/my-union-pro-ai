-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "maxUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_maxUserId_key" ON "User"("maxUserId");
