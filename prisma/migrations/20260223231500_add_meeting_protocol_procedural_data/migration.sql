-- Add protocol procedural votes payload for meeting protocol step
ALTER TABLE "Meeting"
ADD COLUMN IF NOT EXISTS "protocolProceduralData" JSONB;
