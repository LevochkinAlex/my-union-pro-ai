-- Миграция для добавления полей членства в профсоюзе
-- Выполните эту миграцию после обновления схемы Prisma

-- Добавление полей в таблицу User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "unionCardNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "membershipJoinedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "unionMembershipStatus" TEXT DEFAULT 'NOT_ACCEPTED';

-- Создание уникального индекса для номера карточки
CREATE UNIQUE INDEX IF NOT EXISTS "User_unionCardNumber_key" ON "User"("unionCardNumber");

-- Создание индексов для оптимизации запросов
CREATE INDEX IF NOT EXISTS "User_unionCardNumber_idx" ON "User"("unionCardNumber");
CREATE INDEX IF NOT EXISTS "User_unionMembershipStatus_idx" ON "User"("unionMembershipStatus");

-- Добавление новых типов документов в enum DocumentType
-- Примечание: В PostgreSQL enum изменяется через ALTER TYPE
-- Если у вас уже есть enum DocumentType, выполните:
-- ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_REMOVAL_APPLICATION';
-- ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'MEMBERSHIP_TRANSFER_APPLICATION';

-- Создание таблицы MembershipHistory
CREATE TABLE IF NOT EXISTS "MembershipHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "organizationName" TEXT,
    "status" TEXT NOT NULL,
    "statusDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipHistory_pkey" PRIMARY KEY ("id")
);

-- Создание индексов для MembershipHistory
CREATE INDEX IF NOT EXISTS "MembershipHistory_userId_idx" ON "MembershipHistory"("userId");
CREATE INDEX IF NOT EXISTS "MembershipHistory_organizationId_idx" ON "MembershipHistory"("organizationId");
CREATE INDEX IF NOT EXISTS "MembershipHistory_statusDate_idx" ON "MembershipHistory"("statusDate");

-- Добавление внешних ключей
ALTER TABLE "MembershipHistory" ADD CONSTRAINT "MembershipHistory_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipHistory" ADD CONSTRAINT "MembershipHistory_organizationId_fkey" 
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

