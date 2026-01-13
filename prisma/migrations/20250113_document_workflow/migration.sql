-- ============================================================================
-- Миграция: Полноценный документооборот с workflow согласования
-- ============================================================================

-- 1. Добавляем категорию документа (входящие/исходящие/внутренние)
DO $$ BEGIN
    CREATE TYPE "DocumentCategory" AS ENUM ('INCOMING', 'OUTGOING', 'INTERNAL', 'DRAFT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Обновляем статусы документов для workflow
-- Сначала переименовываем старый enum
ALTER TYPE "DocumentStatus" RENAME TO "DocumentStatus_old";

-- Создаём новый enum с расширенными статусами
CREATE TYPE "DocumentStatus" AS ENUM (
    'DRAFT',           -- Черновик
    'GENERATED',       -- Сгенерирован (готов к подписи)
    'PENDING_REVIEW',  -- На рассмотрении
    'PENDING_APPROVAL',-- На согласовании
    'PENDING_SIGNATURE',-- На подписи
    'SIGNED',          -- Подписан
    'REGISTERED',      -- Зарегистрирован
    'SENT',            -- Отправлен
    'RECEIVED',        -- Получен
    'COMPLETED',       -- Исполнен
    'REJECTED',        -- Отклонён
    'ARCHIVED'         -- В архиве
);

-- Убираем default перед изменением типа
ALTER TABLE "Document" ALTER COLUMN "status" DROP DEFAULT;

-- Конвертируем существующие данные
ALTER TABLE "Document" ALTER COLUMN "status" TYPE "DocumentStatus" 
USING (
    CASE status::text
        WHEN 'DRAFT' THEN 'DRAFT'::"DocumentStatus"
        WHEN 'GENERATED' THEN 'GENERATED'::"DocumentStatus"
        WHEN 'SIGNED' THEN 'SIGNED'::"DocumentStatus"
        WHEN 'PENDING' THEN 'PENDING_REVIEW'::"DocumentStatus"
        WHEN 'APPROVED' THEN 'COMPLETED'::"DocumentStatus"
        WHEN 'REJECTED' THEN 'REJECTED'::"DocumentStatus"
        WHEN 'ARCHIVED' THEN 'ARCHIVED'::"DocumentStatus"
        ELSE 'DRAFT'::"DocumentStatus"
    END
);

-- Возвращаем default значение
ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"DocumentStatus";

-- Удаляем старый тип
DROP TYPE "DocumentStatus_old";

-- 3. Добавляем новые поля в таблицу Document
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "category" "DocumentCategory" DEFAULT 'INTERNAL';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "regNumber" VARCHAR(50);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "regDate" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

-- Отправитель (для входящих документов)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "senderName" VARCHAR(500);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "senderOrganization" VARCHAR(500);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "senderRegNumber" VARCHAR(100);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "senderDate" TIMESTAMP(3);

-- Получатель (для исходящих документов)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "recipientName" VARCHAR(500);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "recipientOrganization" VARCHAR(500);

-- Workflow согласования
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "assignedToId" VARCHAR(50);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "approvedById" VARCHAR(50);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "signedById" VARCHAR(50);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP(3);

-- Связь с родительским документом (для ответов на документы)
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "parentDocumentId" VARCHAR(50);

-- Приоритет и срочность
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "priority" VARCHAR(20) DEFAULT 'NORMAL';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "isUrgent" BOOLEAN DEFAULT false;

-- Примечания для исполнителя
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "executionNotes" TEXT;

-- 4. Создаём таблицу истории статусов документа
CREATE TABLE IF NOT EXISTS "DocumentStatusHistory" (
    "id" VARCHAR(50) NOT NULL,
    "documentId" VARCHAR(50) NOT NULL,
    "status" "DocumentStatus" NOT NULL,
    "previousStatus" "DocumentStatus",
    "changedById" VARCHAR(50),
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- 5. Создаём таблицу согласований документа (кто должен согласовать)
CREATE TABLE IF NOT EXISTS "DocumentApproval" (
    "id" VARCHAR(50) NOT NULL,
    "documentId" VARCHAR(50) NOT NULL,
    "userId" VARCHAR(50) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentApproval_pkey" PRIMARY KEY ("id")
);

-- 6. Создаём таблицу журнала регистрации документов
CREATE TABLE IF NOT EXISTS "DocumentRegistry" (
    "id" VARCHAR(50) NOT NULL,
    "organizationId" VARCHAR(50) NOT NULL,
    "year" INTEGER NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "prefix" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRegistry_pkey" PRIMARY KEY ("id")
);

-- 7. Добавляем индексы
CREATE INDEX IF NOT EXISTS "Document_category_idx" ON "Document"("category");
CREATE INDEX IF NOT EXISTS "Document_regNumber_idx" ON "Document"("regNumber");
CREATE INDEX IF NOT EXISTS "Document_regDate_idx" ON "Document"("regDate");
CREATE INDEX IF NOT EXISTS "Document_assignedToId_idx" ON "Document"("assignedToId");
CREATE INDEX IF NOT EXISTS "Document_parentDocumentId_idx" ON "Document"("parentDocumentId");
CREATE INDEX IF NOT EXISTS "Document_priority_idx" ON "Document"("priority");

CREATE INDEX IF NOT EXISTS "DocumentStatusHistory_documentId_idx" ON "DocumentStatusHistory"("documentId");
CREATE INDEX IF NOT EXISTS "DocumentStatusHistory_changedById_idx" ON "DocumentStatusHistory"("changedById");

CREATE INDEX IF NOT EXISTS "DocumentApproval_documentId_idx" ON "DocumentApproval"("documentId");
CREATE INDEX IF NOT EXISTS "DocumentApproval_userId_idx" ON "DocumentApproval"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentRegistry_orgId_year_category_idx" ON "DocumentRegistry"("organizationId", "year", "category");

-- 8. Добавляем внешние ключи
ALTER TABLE "Document" 
ADD CONSTRAINT "Document_assignedToId_fkey" 
FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" 
ADD CONSTRAINT "Document_approvedById_fkey" 
FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" 
ADD CONSTRAINT "Document_signedById_fkey" 
FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" 
ADD CONSTRAINT "Document_parentDocumentId_fkey" 
FOREIGN KEY ("parentDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentStatusHistory" 
ADD CONSTRAINT "DocumentStatusHistory_documentId_fkey" 
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentStatusHistory" 
ADD CONSTRAINT "DocumentStatusHistory_changedById_fkey" 
FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentApproval" 
ADD CONSTRAINT "DocumentApproval_documentId_fkey" 
FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentApproval" 
ADD CONSTRAINT "DocumentApproval_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentRegistry" 
ADD CONSTRAINT "DocumentRegistry_organizationId_fkey" 
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Комментарии
COMMENT ON COLUMN "Document"."category" IS 'Категория документа: INCOMING - входящий, OUTGOING - исходящий, INTERNAL - внутренний, DRAFT - черновик';
COMMENT ON COLUMN "Document"."regNumber" IS 'Регистрационный номер документа';
COMMENT ON COLUMN "Document"."regDate" IS 'Дата регистрации документа';
COMMENT ON COLUMN "Document"."priority" IS 'Приоритет: LOW, NORMAL, HIGH, URGENT';
COMMENT ON TABLE "DocumentStatusHistory" IS 'История изменений статуса документа';
COMMENT ON TABLE "DocumentApproval" IS 'Цепочка согласования документа';
COMMENT ON TABLE "DocumentRegistry" IS 'Журнал регистрации документов для автонумерации';
