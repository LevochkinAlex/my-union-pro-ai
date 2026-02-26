-- Add global scope key for system-wide channels.
ALTER TABLE "NewsChannel"
ADD COLUMN IF NOT EXISTS "globalScopeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "NewsChannel_globalScopeKey_key"
ON "NewsChannel" ("globalScopeKey");
