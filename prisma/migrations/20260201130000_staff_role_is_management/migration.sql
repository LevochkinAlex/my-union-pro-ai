-- AlterTable StaffRole: управленец профкома (для полей Докладывает/Со-докладчик)
ALTER TABLE "StaffRole" ADD COLUMN IF NOT EXISTS "isManagement" BOOLEAN NOT NULL DEFAULT false;
UPDATE "StaffRole" SET "isManagement" = true WHERE "name" = 'Заместитель председателя';
