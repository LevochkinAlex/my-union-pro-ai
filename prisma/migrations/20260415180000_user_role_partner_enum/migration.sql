-- Синхронизация enum UserRole с продом: значение PARTNER уже может существовать в PostgreSQL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'PARTNER'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'PARTNER';
  END IF;
END $$;
