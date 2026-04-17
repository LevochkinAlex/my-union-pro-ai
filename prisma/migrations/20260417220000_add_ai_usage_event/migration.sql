-- Таблица событий использования ИИ: источник данных для админской аналитики расходов.

CREATE TABLE IF NOT EXISTS "AIUsageEvent" (
  "id"             TEXT        NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider"       TEXT        NOT NULL DEFAULT 'yandex',
  "model"          TEXT        NOT NULL,
  "operation"      TEXT        NOT NULL,
  "route"          TEXT        NOT NULL,
  "inputTokens"    INTEGER     NOT NULL DEFAULT 0,
  "outputTokens"   INTEGER     NOT NULL DEFAULT 0,
  "totalTokens"    INTEGER     NOT NULL DEFAULT 0,
  "costKopecks"    INTEGER     NOT NULL DEFAULT 0,
  "userId"         TEXT,
  "organizationId" TEXT,
  "botId"          TEXT,
  "durationMs"     INTEGER,
  "status"         TEXT        NOT NULL DEFAULT 'ok',
  "error"          TEXT,
  CONSTRAINT "AIUsageEvent_pkey" PRIMARY KEY ("id")
);

-- Связи по идентификаторам (onDelete SetNull — мы не хотим терять историю расходов
-- при удалении пользователя/организации/бота)
ALTER TABLE "AIUsageEvent"
  ADD CONSTRAINT "AIUsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AIUsageEvent"
  ADD CONSTRAINT "AIUsageEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AIUsageEvent"
  ADD CONSTRAINT "AIUsageEvent_botId_fkey"
  FOREIGN KEY ("botId") REFERENCES "ChatBot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Индексы под типовые выборки в админке (период, разрезы, статистика)
CREATE INDEX IF NOT EXISTS "AIUsageEvent_createdAt_idx"     ON "AIUsageEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_route_idx"         ON "AIUsageEvent"("route");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_userId_idx"        ON "AIUsageEvent"("userId");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_organizationId_idx" ON "AIUsageEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_botId_idx"         ON "AIUsageEvent"("botId");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_provider_model_idx" ON "AIUsageEvent"("provider", "model");
CREATE INDEX IF NOT EXISTS "AIUsageEvent_operation_createdAt_idx" ON "AIUsageEvent"("operation", "createdAt");
