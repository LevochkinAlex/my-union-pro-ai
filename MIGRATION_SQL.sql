-- ===================================================================
-- МИГРАЦИЯ ДЛЯ PROD: Добавление полей в ChatMessage
-- ===================================================================
-- Скопируйте этот SQL и выполните в вашей PROD базе данных
-- (Supabase SQL Editor / Railway / Vercel Postgres)
-- ===================================================================

-- 1. Добавляем поля
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;

-- 2. Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");
CREATE INDEX IF NOT EXISTS "ChatMessage_forwardedFromId_idx" ON "ChatMessage"("forwardedFromId");
CREATE INDEX IF NOT EXISTS "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");

-- 3. Добавляем внешние ключи
DO $$
BEGIN
    -- Проверяем и добавляем FK для replyToId
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_replyToId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" 
        ADD CONSTRAINT "ChatMessage_replyToId_fkey" 
        FOREIGN KEY ("replyToId") 
        REFERENCES "ChatMessage"("id") 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
    END IF;
    
    -- Проверяем и добавляем FK для forwardedFromId
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_forwardedFromId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" 
        ADD CONSTRAINT "ChatMessage_forwardedFromId_fkey" 
        FOREIGN KEY ("forwardedFromId") 
        REFERENCES "ChatMessage"("id") 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 4. Проверка: Убедитесь, что все поля добавлены
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'ChatMessage' 
AND column_name IN ('deletedAt', 'editedAt', 'replyToId', 'forwardedFromId')
ORDER BY column_name;

-- Должно вернуть 4 строки:
-- deletedAt        | timestamp without time zone | YES
-- editedAt         | timestamp without time zone | YES
-- forwardedFromId  | text                        | YES
-- replyToId        | text                        | YES

-- ===================================================================
-- ПОСЛЕ ВЫПОЛНЕНИЯ:
-- 1. Перезапустите приложение на Vercel (Deployments → Redeploy)
-- 2. Очистите кэш браузера (Cmd+Shift+R или Ctrl+Shift+R)
-- 3. Попробуйте удалить сообщение снова
-- ===================================================================

