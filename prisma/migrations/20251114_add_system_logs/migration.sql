-- Add SystemLog model for error tracking and monitoring
CREATE TABLE "SystemLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "level" TEXT NOT NULL DEFAULT 'INFO', -- INFO, WARNING, ERROR, CRITICAL
  "source" TEXT NOT NULL, -- API endpoint, component name, etc
  "message" TEXT NOT NULL,
  "details" JSONB,
  "stackTrace" TEXT,
  "userId" TEXT,
  "metadata" JSONB,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "notificationSent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SystemLog_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");
CREATE INDEX "SystemLog_source_idx" ON "SystemLog"("source");
CREATE INDEX "SystemLog_resolved_idx" ON "SystemLog"("resolved");
CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt" DESC);
CREATE INDEX "SystemLog_userId_idx" ON "SystemLog"("userId");

