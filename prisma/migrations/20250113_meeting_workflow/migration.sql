-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('COMMITTEE', 'BUREAU', 'GROUP', 'YOUTH_COUNCIL', 'PRESIDIUM', 'GENERAL');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'VOTING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingFormat" AS ENUM ('OFFLINE', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "MeetingParticipantRole" AS ENUM ('CHAIRMAN', 'SECRETARY', 'MEMBER', 'INVITED', 'OBSERVER');

-- CreateEnum
CREATE TYPE "MeetingAttendanceStatus" AS ENUM ('INVITED', 'CONFIRMED', 'PRESENT', 'ABSENT', 'EXCUSED');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "MeetingType" NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "format" "MeetingFormat" NOT NULL DEFAULT 'OFFLINE',
    "number" TEXT,
    "title" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TEXT,
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "location" TEXT,
    "onlineLink" TEXT,
    "agendaDocumentId" TEXT,
    "protocolDocumentId" TEXT,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,
    "externalPosition" TEXT,
    "role" "MeetingParticipantRole" NOT NULL DEFAULT 'MEMBER',
    "attendance" "MeetingAttendanceStatus" NOT NULL DEFAULT 'INVITED',
    "canVote" BOOLEAN NOT NULL DEFAULT true,
    "hasVoted" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "heardText" TEXT,
    "speakerId" TEXT,
    "speakerName" TEXT,
    "speakerPosition" TEXT,
    "resolutionText" TEXT,
    "votesFor" INTEGER NOT NULL DEFAULT 0,
    "votesAgainst" INTEGER NOT NULL DEFAULT 0,
    "votesAbstained" INTEGER NOT NULL DEFAULT 0,
    "votingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN,
    "attachments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgendaVote" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "participantId" TEXT,
    "userId" TEXT,
    "voterName" TEXT,
    "vote" TEXT NOT NULL,
    "comment" TEXT,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAgendaVote_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "meetingExtractId" TEXT;
ALTER TABLE "Document" ADD COLUMN "meetingResolutionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_agendaDocumentId_key" ON "Meeting"("agendaDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_protocolDocumentId_key" ON "Meeting"("protocolDocumentId");

-- CreateIndex
CREATE INDEX "Meeting_organizationId_idx" ON "Meeting"("organizationId");

-- CreateIndex
CREATE INDEX "Meeting_type_idx" ON "Meeting"("type");

-- CreateIndex
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");

-- CreateIndex
CREATE INDEX "Meeting_scheduledDate_idx" ON "Meeting"("scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_role_idx" ON "MeetingParticipant"("role");

-- CreateIndex
CREATE INDEX "MeetingParticipant_attendance_idx" ON "MeetingParticipant"("attendance");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_meetingId_idx" ON "MeetingAgendaItem"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAgendaItem_orderNumber_idx" ON "MeetingAgendaItem"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAgendaVote_agendaItemId_userId_key" ON "MeetingAgendaVote"("agendaItemId", "userId");

-- CreateIndex
CREATE INDEX "MeetingAgendaVote_agendaItemId_idx" ON "MeetingAgendaVote"("agendaItemId");

-- CreateIndex
CREATE INDEX "MeetingAgendaVote_userId_idx" ON "MeetingAgendaVote"("userId");

-- CreateIndex
CREATE INDEX "Document_meetingResolutionId_idx" ON "Document"("meetingResolutionId");

-- CreateIndex
CREATE INDEX "Document_meetingExtractId_idx" ON "Document"("meetingExtractId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_meetingResolutionId_fkey" FOREIGN KEY ("meetingResolutionId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_meetingExtractId_fkey" FOREIGN KEY ("meetingExtractId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_agendaDocumentId_fkey" FOREIGN KEY ("agendaDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_protocolDocumentId_fkey" FOREIGN KEY ("protocolDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaItem" ADD CONSTRAINT "MeetingAgendaItem_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaVote" ADD CONSTRAINT "MeetingAgendaVote_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "MeetingAgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAgendaVote" ADD CONSTRAINT "MeetingAgendaVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
