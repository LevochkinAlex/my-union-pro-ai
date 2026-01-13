-- Add Matrix room IDs to Chat and Ticket models

-- AlterTable: Add matrixRoomId to Chat
ALTER TABLE "Chat" ADD COLUMN "matrixRoomId" TEXT;

-- CreateIndex: Unique constraint on Chat.matrixRoomId
CREATE UNIQUE INDEX "Chat_matrixRoomId_key" ON "Chat"("matrixRoomId");

-- AlterTable: Add matrixRoomId to Ticket
ALTER TABLE "Ticket" ADD COLUMN "matrixRoomId" TEXT;

-- CreateIndex: Unique constraint on Ticket.matrixRoomId
CREATE UNIQUE INDEX "Ticket_matrixRoomId_key" ON "Ticket"("matrixRoomId");
