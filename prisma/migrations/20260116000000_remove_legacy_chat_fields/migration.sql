-- Migration: Remove legacy chat fields
-- Удаление старых полей participant1Id, participant2Id и связанных с ними полей

-- 1. Удаляем старые индексы и ограничения
DROP INDEX IF EXISTS "Chat_participant1Id_idx";
DROP INDEX IF EXISTS "Chat_participant2Id_idx";
DROP INDEX IF EXISTS "Chat_createdById_idx"; -- Это нужно оставить, пересоздадим

-- Удаляем уникальное ограничение
ALTER TABLE "Chat" DROP CONSTRAINT IF EXISTS "unique_private_chat";

-- 2. Удаляем старые поля
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "participant1Id";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "participant2Id";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "participant1ReadAt";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "participant2ReadAt";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "participant1ClearedAt";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "participant2ClearedAt";
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "lastMessage"; -- Сообщения теперь только в Matrix

-- 3. Восстанавливаем нужные индексы
CREATE INDEX IF NOT EXISTS "Chat_createdById_idx" ON "Chat"("createdById");
CREATE INDEX IF NOT EXISTS "Chat_matrixRoomId_idx" ON "Chat"("matrixRoomId");

-- 4. Удаляем связи с User (если они еще есть в схеме, Prisma удалит их автоматически)
