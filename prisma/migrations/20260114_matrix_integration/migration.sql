-- Add Matrix integration fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "matrixUserId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "matrixAccessToken" TEXT;

-- Create unique index for matrixUserId
CREATE UNIQUE INDEX IF NOT EXISTS "User_matrixUserId_key" ON "User"("matrixUserId");
