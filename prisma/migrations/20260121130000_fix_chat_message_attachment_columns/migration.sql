-- Fix ChatMessageAttachment table structure
DO $$ 
BEGIN
    -- Add url column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'url'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "url" TEXT NOT NULL DEFAULT '';
        UPDATE "ChatMessageAttachment" SET "url" = '' WHERE "url" IS NULL;
        ALTER TABLE "ChatMessageAttachment" ALTER COLUMN "url" DROP DEFAULT;
    END IF;

    -- Add name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'name'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Файл';
        UPDATE "ChatMessageAttachment" SET "name" = 'Файл' WHERE "name" IS NULL;
        ALTER TABLE "ChatMessageAttachment" ALTER COLUMN "name" DROP DEFAULT;
    END IF;

    -- Add type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'type'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'file';
        UPDATE "ChatMessageAttachment" SET "type" = 'file' WHERE "type" IS NULL;
        ALTER TABLE "ChatMessageAttachment" ALTER COLUMN "type" DROP DEFAULT;
    END IF;

    -- Add size column if it doesn't exist (nullable)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'size'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "size" INTEGER;
    END IF;

    -- Add mimeType column if it doesn't exist (nullable)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'mimeType'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "mimeType" TEXT;
    END IF;

    -- Add thumbnailUrl column if it doesn't exist (nullable)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'thumbnailUrl'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "thumbnailUrl" TEXT;
    END IF;

    -- Add width column if it doesn't exist (nullable)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'width'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "width" INTEGER;
    END IF;

    -- Add height column if it doesn't exist (nullable)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'height'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "height" INTEGER;
    END IF;

    -- Add createdAt column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'ChatMessageAttachment' 
        AND column_name = 'createdAt'
    ) THEN
        ALTER TABLE "ChatMessageAttachment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;
