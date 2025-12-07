-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_chatId_deletedAt_createdAt_idx" ON "ChatMessage"("chatId", "deletedAt", "createdAt");

