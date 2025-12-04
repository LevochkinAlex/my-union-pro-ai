# Применение миграции на PROD

## Проблема
Миграция не применилась на прод, поэтому:
- ❌ Не удаляются сообщения (нет поля `deletedAt`)
- ❌ Не работает редактирование (нет поля `editedAt`)
- ❌ Не работает пересылка (нет поля `forwardedFromId`)

## Решение

### Вариант 1: Через Vercel CLI (рекомендуется)
```bash
# 1. Установите Vercel CLI (если еще нет)
npm i -g vercel

# 2. Войдите в аккаунт
vercel login

# 3. Примените миграцию
vercel exec pnpm prisma migrate deploy
```

### Вариант 2: Вручную через SQL

1. Подключитесь к вашей PROD базе данных (через Supabase/Railway/Vercel Dashboard)

2. Выполните этот SQL скрипт:

```sql
-- Add missing fields to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");
CREATE INDEX IF NOT EXISTS "ChatMessage_forwardedFromId_idx" ON "ChatMessage"("forwardedFromId");
CREATE INDEX IF NOT EXISTS "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");

-- Add foreign keys
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
```

### Вариант 3: В .env.local

Если вы уже настроили локальную работу с PROD базой:

```bash
# Убедитесь что в .env указана PROD база
cat .env | grep DATABASE_URL

# Примените миграцию
pnpm prisma migrate deploy
```

## Проверка

После применения миграции проверьте:

```sql
-- Проверка наличия полей
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ChatMessage' 
AND column_name IN ('deletedAt', 'editedAt', 'replyToId', 'forwardedFromId');
```

Должны появиться все 4 поля.

## ⚠️ Важно!

После применения миграции **перезапустите приложение на Vercel** (или вашем хостинге).

