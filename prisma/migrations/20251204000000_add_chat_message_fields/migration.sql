-- Add missing fields to ChatMessage for message editing, deletion, replies and forwarding

-- Add editedAt field
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

-- Add deletedAt field for soft delete
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Add replyToId for message replies
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;

-- Add forwardedFromId for forwarded messages
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");
CREATE INDEX IF NOT EXISTS "ChatMessage_forwardedFromId_idx" ON "ChatMessage"("forwardedFromId");
CREATE INDEX IF NOT EXISTS "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");

-- Add foreign key constraints (if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_replyToId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" 
        FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_forwardedFromId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_forwardedFromId_fkey" 
        FOREIGN KEY ("forwardedFromId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

