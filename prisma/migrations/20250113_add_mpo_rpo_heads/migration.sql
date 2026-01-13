-- Добавляем поля для руководителей МПО и РПО в User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isMPOHead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mpoHeadOrganizationId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isRPOHead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rpoHeadOrganizationId" TEXT;

-- Создаём уникальные ограничения
ALTER TABLE "User" ADD CONSTRAINT "User_mpoHeadOrganizationId_key" UNIQUE ("mpoHeadOrganizationId");
ALTER TABLE "User" ADD CONSTRAINT "User_rpoHeadOrganizationId_key" UNIQUE ("rpoHeadOrganizationId");

-- Создаём внешние ключи
ALTER TABLE "User" ADD CONSTRAINT "User_mpoHeadOrganizationId_fkey" 
  FOREIGN KEY ("mpoHeadOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_rpoHeadOrganizationId_fkey" 
  FOREIGN KEY ("rpoHeadOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Удаляем старое поле chairmanId из Organization (связь теперь через User)
-- Сначала удаляем внешний ключ если существует
ALTER TABLE "Organization" DROP CONSTRAINT IF EXISTS "Organization_chairmanId_fkey";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "chairmanId";

-- Создаём индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS "User_mpoHeadOrganizationId_idx" ON "User"("mpoHeadOrganizationId");
CREATE INDEX IF NOT EXISTS "User_rpoHeadOrganizationId_idx" ON "User"("rpoHeadOrganizationId");
CREATE INDEX IF NOT EXISTS "User_isMPOHead_idx" ON "User"("isMPOHead");
CREATE INDEX IF NOT EXISTS "User_isRPOHead_idx" ON "User"("isRPOHead");
