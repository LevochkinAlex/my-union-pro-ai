-- Миграция для добавления функционала Председателя ППО

-- 1. Добавляем новые типы документов в enum DocumentType (если еще не добавлены)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'AGENDA' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')) THEN
        ALTER TYPE "DocumentType" ADD VALUE 'AGENDA';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PROTOCOL' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')) THEN
        ALTER TYPE "DocumentType" ADD VALUE 'PROTOCOL';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RESOLUTION' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')) THEN
        ALTER TYPE "DocumentType" ADD VALUE 'RESOLUTION';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PROTOCOL_EXTRACT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DocumentType')) THEN
        ALTER TYPE "DocumentType" ADD VALUE 'PROTOCOL_EXTRACT';
    END IF;
END $$;

-- 2. Добавляем поле votingMembers в таблицу Document (если еще не добавлено)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Document' AND column_name = 'votingMembers') THEN
        ALTER TABLE "Document" ADD COLUMN "votingMembers" JSONB;
    END IF;
END $$;

-- 3. Добавляем поля для связи Ticket с Chat и Organization
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Ticket' AND column_name = 'chatId') THEN
        ALTER TABLE "Ticket" ADD COLUMN "chatId" TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_chatId_key" ON "Ticket"("chatId");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Ticket' AND column_name = 'rejectionReason') THEN
        ALTER TABLE "Ticket" ADD COLUMN "rejectionReason" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Ticket' AND column_name = 'organizationId') THEN
        ALTER TABLE "Ticket" ADD COLUMN "organizationId" TEXT;
    END IF;
END $$;

-- 4. Добавляем внешние ключи для Ticket
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Ticket_chatId_fkey' AND table_name = 'Ticket'
    ) THEN
        ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_chatId_fkey" 
        FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Ticket_organizationId_fkey' AND table_name = 'Ticket'
    ) THEN
        ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_fkey" 
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 5. Создаем таблицу TicketActionLog
CREATE TABLE IF NOT EXISTS "TicketActionLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketActionLog_pkey" PRIMARY KEY ("id")
);

-- 6. Добавляем индексы для TicketActionLog
CREATE INDEX IF NOT EXISTS "TicketActionLog_ticketId_idx" ON "TicketActionLog"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketActionLog_userId_idx" ON "TicketActionLog"("userId");
CREATE INDEX IF NOT EXISTS "TicketActionLog_actionType_idx" ON "TicketActionLog"("actionType");
CREATE INDEX IF NOT EXISTS "TicketActionLog_createdAt_idx" ON "TicketActionLog"("createdAt");

-- 7. Добавляем внешние ключи для TicketActionLog
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'TicketActionLog_ticketId_fkey' AND table_name = 'TicketActionLog'
    ) THEN
        ALTER TABLE "TicketActionLog" ADD CONSTRAINT "TicketActionLog_ticketId_fkey" 
        FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'TicketActionLog_userId_fkey' AND table_name = 'TicketActionLog'
    ) THEN
        ALTER TABLE "TicketActionLog" ADD CONSTRAINT "TicketActionLog_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 8. Создаем enum ChatType
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatType') THEN
        CREATE TYPE "ChatType" AS ENUM ('PRIVATE', 'GROUP');
    END IF;
END $$;

-- 9. Добавляем поля для групповых чатов в таблицу Chat
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'type') THEN
        ALTER TABLE "Chat" ADD COLUMN "type" "ChatType" NOT NULL DEFAULT 'PRIVATE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'name') THEN
        ALTER TABLE "Chat" ADD COLUMN "name" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'description') THEN
        ALTER TABLE "Chat" ADD COLUMN "description" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'iconUrl') THEN
        ALTER TABLE "Chat" ADD COLUMN "iconUrl" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'isPublic') THEN
        ALTER TABLE "Chat" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'createdById') THEN
        ALTER TABLE "Chat" ADD COLUMN "createdById" TEXT;
    END IF;
END $$;

-- 10. Делаем participant1Id и participant2Id опциональными для групповых чатов
DO $$ 
BEGIN
    -- Проверяем, можно ли изменить колонку на nullable
    -- В PostgreSQL это делается через ALTER COLUMN ... DROP NOT NULL
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'participant1Id' AND is_nullable = 'NO') THEN
        ALTER TABLE "Chat" ALTER COLUMN "participant1Id" DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Chat' AND column_name = 'participant2Id' AND is_nullable = 'NO') THEN
        ALTER TABLE "Chat" ALTER COLUMN "participant2Id" DROP NOT NULL;
    END IF;
END $$;

-- 11. Добавляем внешний ключ для createdById
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Chat_createdById_fkey' AND table_name = 'Chat'
    ) THEN
        ALTER TABLE "Chat" ADD CONSTRAINT "Chat_createdById_fkey" 
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 12. Обновляем уникальный индекс для личных чатов (делаем его условным)
-- Удаляем старый уникальный индекс, если он существует
DROP INDEX IF EXISTS "Chat_participant1Id_participant2Id_key";
-- Создаем новый условный уникальный индекс только для личных чатов
CREATE UNIQUE INDEX IF NOT EXISTS "unique_private_chat" ON "Chat"("participant1Id", "participant2Id") 
WHERE "type" = 'PRIVATE' AND "participant1Id" IS NOT NULL AND "participant2Id" IS NOT NULL;

-- 13. Добавляем индексы для Chat
CREATE INDEX IF NOT EXISTS "Chat_createdById_idx" ON "Chat"("createdById");
CREATE INDEX IF NOT EXISTS "Chat_type_idx" ON "Chat"("type");

-- 14. Создаем таблицу ChatParticipant
CREATE TABLE IF NOT EXISTS "ChatParticipant" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "invitedById" TEXT,
    "readAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChatParticipant_chatId_userId_key" UNIQUE ("chatId", "userId")
);

-- 15. Добавляем индексы для ChatParticipant
CREATE INDEX IF NOT EXISTS "ChatParticipant_chatId_idx" ON "ChatParticipant"("chatId");
CREATE INDEX IF NOT EXISTS "ChatParticipant_userId_idx" ON "ChatParticipant"("userId");
CREATE INDEX IF NOT EXISTS "ChatParticipant_role_idx" ON "ChatParticipant"("role");

-- 16. Добавляем внешние ключи для ChatParticipant
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ChatParticipant_chatId_fkey' AND table_name = 'ChatParticipant'
    ) THEN
        ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_chatId_fkey" 
        FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ChatParticipant_userId_fkey' AND table_name = 'ChatParticipant'
    ) THEN
        ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ChatParticipant_invitedById_fkey' AND table_name = 'ChatParticipant'
    ) THEN
        ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_invitedById_fkey" 
        FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 17. Создаем таблицу NewsChannel
CREATE TABLE IF NOT EXISTS "NewsChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "organizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsChannel_pkey" PRIMARY KEY ("id")
);

-- 18. Добавляем индексы для NewsChannel
CREATE INDEX IF NOT EXISTS "NewsChannel_organizationId_idx" ON "NewsChannel"("organizationId");
CREATE INDEX IF NOT EXISTS "NewsChannel_createdById_idx" ON "NewsChannel"("createdById");
CREATE INDEX IF NOT EXISTS "NewsChannel_isMain_idx" ON "NewsChannel"("isMain");

-- 19. Добавляем внешние ключи для NewsChannel
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'NewsChannel_organizationId_fkey' AND table_name = 'NewsChannel'
    ) THEN
        ALTER TABLE "NewsChannel" ADD CONSTRAINT "NewsChannel_organizationId_fkey" 
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'NewsChannel_createdById_fkey' AND table_name = 'NewsChannel'
    ) THEN
        ALTER TABLE "NewsChannel" ADD CONSTRAINT "NewsChannel_createdById_fkey" 
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 20. Добавляем поле channelId в таблицу NewsPost
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'NewsPost' AND column_name = 'channelId') THEN
        ALTER TABLE "NewsPost" ADD COLUMN "channelId" TEXT;
    END IF;
END $$;

-- 21. Добавляем внешний ключ для NewsPost.channelId
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'NewsPost_channelId_fkey' AND table_name = 'NewsPost'
    ) THEN
        ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_channelId_fkey" 
        FOREIGN KEY ("channelId") REFERENCES "NewsChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 22. Добавляем индекс для NewsPost.channelId
CREATE INDEX IF NOT EXISTS "NewsPost_channelId_idx" ON "NewsPost"("channelId");

-- 23. Добавляем индексы для Ticket.organizationId
CREATE INDEX IF NOT EXISTS "Ticket_organizationId_idx" ON "Ticket"("organizationId");

