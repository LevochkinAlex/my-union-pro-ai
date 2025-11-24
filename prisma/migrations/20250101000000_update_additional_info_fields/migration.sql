-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "occupation";

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employmentStatus" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "awards" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "training" TEXT;

