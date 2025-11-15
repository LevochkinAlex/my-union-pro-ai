-- AlterTable: Add fcmToken to PushSubscription
ALTER TABLE "PushSubscription" ADD COLUMN "fcmToken" TEXT;
ALTER TABLE "PushSubscription" ALTER COLUMN "oneSignalId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_fcmToken_key" ON "PushSubscription"("fcmToken");

-- CreateIndex
CREATE INDEX "PushSubscription_fcmToken_idx" ON "PushSubscription"("fcmToken");

-- DropIndex (if exists)
DROP INDEX IF EXISTS "PushSubscription_userId_oneSignalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_fcmToken_key" ON "PushSubscription"("userId", "fcmToken");
