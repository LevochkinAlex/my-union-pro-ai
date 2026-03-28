-- CreateTable
CREATE TABLE "BotAppLoginSession" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotAppLoginSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotAppLoginSession_sessionKey_key" ON "BotAppLoginSession"("sessionKey");

-- CreateIndex
CREATE INDEX "BotAppLoginSession_sessionKey_idx" ON "BotAppLoginSession"("sessionKey");

-- CreateIndex
CREATE INDEX "BotAppLoginSession_expiresAt_idx" ON "BotAppLoginSession"("expiresAt");
