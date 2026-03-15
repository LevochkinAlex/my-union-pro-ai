-- Add agendaModifiedAt to track when agenda was changed after last document generation (for "Пересоздать документ" button)
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "agendaModifiedAt" TIMESTAMP(3);
