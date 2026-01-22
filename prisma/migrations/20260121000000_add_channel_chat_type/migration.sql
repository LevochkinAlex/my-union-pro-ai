-- AlterEnum
-- Добавляем тип CHANNEL в enum ChatType (безопасная версия)
-- Проверяем, существует ли уже значение CHANNEL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'CHANNEL' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'ChatType'
        )
    ) THEN
        ALTER TYPE "ChatType" ADD VALUE 'CHANNEL';
    END IF;
END $$;
