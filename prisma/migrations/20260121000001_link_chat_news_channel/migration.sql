-- Add newsChannelId to Chat table
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "newsChannelId" TEXT;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Chat_newsChannelId_fkey'
  ) THEN
    ALTER TABLE "Chat" 
    ADD CONSTRAINT "Chat_newsChannelId_fkey" 
    FOREIGN KEY ("newsChannelId") 
    REFERENCES "NewsChannel"("id") 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Chat_newsChannelId_key'
  ) THEN
    ALTER TABLE "Chat" 
    ADD CONSTRAINT "Chat_newsChannelId_key" 
    UNIQUE ("newsChannelId");
  END IF;
END $$;

-- Add index
CREATE INDEX IF NOT EXISTS "Chat_newsChannelId_idx" ON "Chat"("newsChannelId");
