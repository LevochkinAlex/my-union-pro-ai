-- CreateEnum for AppealType
CREATE TYPE "AppealType" AS ENUM ('LEGAL', 'ACCOUNTING', 'TECHNICAL', 'OTHER');

-- CreateEnum for AppealStatus
CREATE TYPE "AppealStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable UserAppeal
CREATE TABLE "UserAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AppealType" NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "tags" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable AppealAnalytics
CREATE TABLE "AppealAnalytics" (
    "id" TEXT NOT NULL,
    "appealType" "AppealType" NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "commonKeywords" TEXT,
    "averageResolutionTime" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppealAnalytics_pkey" PRIMARY KEY ("id")
);

-- AddColumn appealId to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "appealId" TEXT;

-- CreateIndex for UserAppeal
CREATE INDEX "UserAppeal_userId_idx" ON "UserAppeal"("userId");
CREATE INDEX "UserAppeal_type_idx" ON "UserAppeal"("type");
CREATE INDEX "UserAppeal_status_idx" ON "UserAppeal"("status");
CREATE INDEX "UserAppeal_createdAt_idx" ON "UserAppeal"("createdAt");

-- CreateIndex for AppealAnalytics
CREATE UNIQUE INDEX "AppealAnalytics_appealType_periodStart_periodEnd_key" ON "AppealAnalytics"("appealType", "periodStart", "periodEnd");
CREATE INDEX "AppealAnalytics_appealType_idx" ON "AppealAnalytics"("appealType");
CREATE INDEX "AppealAnalytics_periodStart_idx" ON "AppealAnalytics"("periodStart");

-- CreateIndex for ChatMessage appealId
CREATE INDEX "ChatMessage_appealId_idx" ON "ChatMessage"("appealId");

-- AddForeignKey for UserAppeal
ALTER TABLE "UserAppeal" ADD CONSTRAINT "UserAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for ChatMessage
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "UserAppeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

