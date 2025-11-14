-- Add region field to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "region" TEXT;

