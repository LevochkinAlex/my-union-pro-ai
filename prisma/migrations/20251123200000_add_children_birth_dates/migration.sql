-- AlterTable
ALTER TABLE "User" ADD COLUMN "childrenBirthDates" TEXT;

COMMENT ON COLUMN "User"."childrenBirthDates" IS 'Даты рождения детей в формате JSON: [{"name": "Имя", "birthDate": "YYYY-MM-DD"}] для подарков';

