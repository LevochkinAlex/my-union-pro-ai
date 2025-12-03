-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "DocumentType" NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "cssStyles" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_type_isDefault_key" ON "DocumentTemplate"("type", "isDefault");

-- CreateIndex
CREATE INDEX "DocumentTemplate_type_idx" ON "DocumentTemplate"("type");

-- CreateIndex
CREATE INDEX "DocumentTemplate_isActive_idx" ON "DocumentTemplate"("isActive");

-- CreateIndex
CREATE INDEX "DocumentTemplate_isDefault_idx" ON "DocumentTemplate"("isDefault");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "templateId" TEXT;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
