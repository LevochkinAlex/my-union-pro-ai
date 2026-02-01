-- AlterTable StaffRole: роль в выборном органе (для состава заседаний)
ALTER TABLE "StaffRole" ADD COLUMN IF NOT EXISTS "isElectedBody" BOOLEAN NOT NULL DEFAULT false;
UPDATE "StaffRole" SET "isElectedBody" = true WHERE "name" IN ('Заместитель председателя', 'Член Профкома');

-- Enum: добавить значения присутствия очно/онлайн
ALTER TYPE "MeetingAttendanceStatus" ADD VALUE IF NOT EXISTS 'PRESENT_OFFLINE';
ALTER TYPE "MeetingAttendanceStatus" ADD VALUE IF NOT EXISTS 'PRESENT_ONLINE';

-- AlterTable MeetingAgendaItem: со-докладчик
ALTER TABLE "MeetingAgendaItem" ADD COLUMN IF NOT EXISTS "coSpeakerId" TEXT;
ALTER TABLE "MeetingAgendaItem" ADD COLUMN IF NOT EXISTS "coSpeakerName" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MeetingAgendaItem_coSpeakerId_fkey'
  ) THEN
    ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_coSpeakerId_fkey"
      FOREIGN KEY ("coSpeakerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable Meeting: протокол — председательствующий, секретарь, счётчики голосов
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "presidingOfficerUserId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "secretaryUserId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "voteCounterUserIds" TEXT;
