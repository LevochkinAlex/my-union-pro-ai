-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

COMMENT ON COLUMN "User"."avatarUrl" IS 'URL фотографии профиля пользователя';

