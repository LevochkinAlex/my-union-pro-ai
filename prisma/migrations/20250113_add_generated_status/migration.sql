-- Добавляем значение GENERATED в enum DocumentStatus если его нет
DO $$ BEGIN
    ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'GENERATED' BEFORE 'PENDING_REVIEW';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
