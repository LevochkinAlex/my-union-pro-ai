-- Добавляем поля для отслеживания сроков ответа на обращения

-- Дедлайн для ответа председателя (72 часа с момента создания)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "responseDeadline" TIMESTAMP(3);

-- Дата последнего ответа председателя
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastResponseAt" TIMESTAMP(3);

-- Дата последнего ответа пользователя (после ответа председателя)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastUserResponseAt" TIMESTAMP(3);

-- Дедлайн для ответа пользователя (72 часа после ответа председателя)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "userResponseDeadline" TIMESTAMP(3);

-- Флаг просроченного обращения
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "isOverdue" BOOLEAN NOT NULL DEFAULT false;

-- Дата последнего уведомления о просрочке
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "overdueReportedAt" TIMESTAMP(3);

-- Дата последнего напоминания (ежедневно в 9:00 МСК)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "lastReminderSentAt" TIMESTAMP(3);

-- Дата автоматического закрытия (если пользователь не ответил в течение 72 часов)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "autoClosedAt" TIMESTAMP(3);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS "Ticket_responseDeadline_idx" ON "Ticket"("responseDeadline");
CREATE INDEX IF NOT EXISTS "Ticket_isOverdue_idx" ON "Ticket"("isOverdue");
CREATE INDEX IF NOT EXISTS "Ticket_userResponseDeadline_idx" ON "Ticket"("userResponseDeadline");
