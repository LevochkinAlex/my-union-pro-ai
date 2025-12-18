-- Migration: Add PPO document types (AGENDA, PROTOCOL, RESOLUTION, PROTOCOL_EXTRACT)
-- This migration adds new document types for PPO Head documents

-- Add new enum values to DocumentType
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'AGENDA';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROTOCOL';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'RESOLUTION';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROTOCOL_EXTRACT';

-- Add metadata JSON column to Document table if it doesn't exist
-- (This should already exist, but adding for safety)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Document' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE "Document" ADD COLUMN "metadata" JSONB;
    END IF;
END $$;

