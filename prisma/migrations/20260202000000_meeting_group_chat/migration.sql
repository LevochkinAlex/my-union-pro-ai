-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "meetingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Chat_meetingId_key" ON "Chat"("meetingId");

-- CreateIndex
CREATE INDEX "Chat_meetingId_idx" ON "Chat"("meetingId");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
