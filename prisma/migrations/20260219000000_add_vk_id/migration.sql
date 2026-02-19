-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vkId" TEXT;

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_vkId_key" ON "User"("vkId");
