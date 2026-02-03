-- Add deletedUserDisplayName and clearedAt to ChatParticipant (schema was updated but migration was missing).
-- These columns are used when a user is deleted (display name placeholder) and for "cleared history" per participant.

ALTER TABLE "ChatParticipant" ADD COLUMN IF NOT EXISTS "deletedUserDisplayName" TEXT;

ALTER TABLE "ChatParticipant" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);
