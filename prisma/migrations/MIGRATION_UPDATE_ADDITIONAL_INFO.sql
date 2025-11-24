-- Миграция для обновления полей дополнительной информации
-- Выполните эту миграцию после обновления схемы Prisma

-- Удаление старого поля occupation
ALTER TABLE "User" DROP COLUMN IF EXISTS "occupation";

-- Добавление нового поля employmentStatus
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employmentStatus" TEXT;

-- Добавление полей для наград и обучения
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "awards" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "training" TEXT;

-- Примечание: Поля awards и training хранят JSON массивы:
-- awards: [{"type": "ведомственная"|"государственная"|"профсоюзная", "year": "YYYY", "description": "описание"}]
-- training: [{"name": "название", "year": "YYYY", "description": "описание"}]

