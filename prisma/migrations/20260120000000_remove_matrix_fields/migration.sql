-- Remove Matrix integration fields from User table
ALTER TABLE "User" DROP COLUMN IF EXISTS "matrixUserId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "matrixAccessToken";
