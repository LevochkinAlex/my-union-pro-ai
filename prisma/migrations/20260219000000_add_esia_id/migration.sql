-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "esiaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_esiaId_key" ON "User"("esiaId");
