-- CreateEnum: ReportStatus
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVISION', 'APPROVED', 'CONFIRMED');

-- CreateEnum: ReportPeriodicity  
CREATE TYPE "ReportPeriodicity" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateTable: ReportTemplate (шаблоны отчётов)
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "periodicity" "ReportPeriodicity" NOT NULL DEFAULT 'ANNUAL',
    "forOrganizationTypes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReportTemplateSection (секции шаблона)
CREATE TABLE "ReportTemplateSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReportTemplateField (поля шаблона)
CREATE TABLE "ReportTemplateField" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "num" TEXT,
    "description" TEXT,
    "help" TEXT,
    "fieldType" TEXT NOT NULL DEFAULT 'string',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isMultiple" BOOLEAN NOT NULL DEFAULT false,
    "columnsCount" INTEGER NOT NULL DEFAULT 1,
    "columnHeaders" JSONB,
    "options" JSONB,
    "minValue" INTEGER,
    "maxValue" INTEGER,
    "pattern" TEXT,
    "autoFillFrom" TEXT,
    "formula" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Report (заполненные отчёты)
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB,
    "parentReportId" TEXT,
    "revisionReason" TEXT,
    "filledByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReportStatusHistory (история статусов)
CREATE TABLE "ReportStatusHistory" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fromStatus" "ReportStatus",
    "toStatus" "ReportStatus" NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ReportTemplate
CREATE UNIQUE INDEX "ReportTemplate_code_key" ON "ReportTemplate"("code");
CREATE INDEX "ReportTemplate_code_idx" ON "ReportTemplate"("code");
CREATE INDEX "ReportTemplate_isActive_idx" ON "ReportTemplate"("isActive");

-- CreateIndex: ReportTemplateSection
CREATE UNIQUE INDEX "ReportTemplateSection_templateId_code_key" ON "ReportTemplateSection"("templateId", "code");
CREATE INDEX "ReportTemplateSection_templateId_idx" ON "ReportTemplateSection"("templateId");
CREATE INDEX "ReportTemplateSection_order_idx" ON "ReportTemplateSection"("order");

-- CreateIndex: ReportTemplateField
CREATE UNIQUE INDEX "ReportTemplateField_sectionId_code_key" ON "ReportTemplateField"("sectionId", "code");
CREATE INDEX "ReportTemplateField_sectionId_idx" ON "ReportTemplateField"("sectionId");
CREATE INDEX "ReportTemplateField_order_idx" ON "ReportTemplateField"("order");

-- CreateIndex: Report
CREATE UNIQUE INDEX "Report_templateId_organizationId_periodYear_periodMonth_key" ON "Report"("templateId", "organizationId", "periodYear", "periodMonth");
CREATE INDEX "Report_templateId_idx" ON "Report"("templateId");
CREATE INDEX "Report_organizationId_idx" ON "Report"("organizationId");
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE INDEX "Report_periodYear_idx" ON "Report"("periodYear");
CREATE INDEX "Report_deadline_idx" ON "Report"("deadline");

-- CreateIndex: ReportStatusHistory
CREATE INDEX "ReportStatusHistory_reportId_idx" ON "ReportStatusHistory"("reportId");
CREATE INDEX "ReportStatusHistory_createdAt_idx" ON "ReportStatusHistory"("createdAt");

-- AddForeignKey: ReportTemplateSection
ALTER TABLE "ReportTemplateSection" ADD CONSTRAINT "ReportTemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ReportTemplateField
ALTER TABLE "ReportTemplateField" ADD CONSTRAINT "ReportTemplateField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ReportTemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Report
ALTER TABLE "Report" ADD CONSTRAINT "Report_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_parentReportId_fkey" FOREIGN KEY ("parentReportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ReportStatusHistory
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
