-- Добавляем PIN-код (6 цифр, bcrypt) и счётчик попыток в LoginToken.
-- Нужно для email-входа по одноразовому коду в том же окне (без клика по ссылке).

ALTER TABLE "LoginToken"
  ADD COLUMN IF NOT EXISTS "pinHash" TEXT;

ALTER TABLE "LoginToken"
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
