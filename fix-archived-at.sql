-- Добавить колонку archivedAt в таблицу Chat если её нет
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
