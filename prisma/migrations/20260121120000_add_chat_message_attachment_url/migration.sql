-- Add url column to ChatMessageAttachment if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'url'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "url" TEXT NOT NULL DEFAULT '';
        
        -- Update existing rows if any (set empty string as default)
        UPDATE "ChatMessageAttachment" SET "url" = '' WHERE "url" IS NULL;
        
        -- Remove default after setting values
        ALTER TABLE "ChatMessageAttachment" ALTER COLUMN "url" DROP DEFAULT;
    END IF;
END $$;
