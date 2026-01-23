-- CreateTable для справочника связи мест работы с ППО
CREATE TABLE "WorkplacePPOMapping" (
    "id" TEXT NOT NULL,
    "workplaceName" TEXT NOT NULL,
    "workplaceInn" TEXT NOT NULL,
    "ppoOrganizationId" TEXT NOT NULL,
    "source" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkplacePPOMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkplacePPOMapping_workplaceName_workplaceInn_key" ON "WorkplacePPOMapping"("workplaceName", "workplaceInn");
CREATE INDEX "WorkplacePPOMapping_workplaceInn_idx" ON "WorkplacePPOMapping"("workplaceInn");
CREATE INDEX "WorkplacePPOMapping_ppoOrganizationId_idx" ON "WorkplacePPOMapping"("ppoOrganizationId");
CREATE INDEX "WorkplacePPOMapping_workplaceName_idx" ON "WorkplacePPOMapping"("workplaceName");

-- AddForeignKey
ALTER TABLE "WorkplacePPOMapping" ADD CONSTRAINT "WorkplacePPOMapping_ppoOrganizationId_fkey" FOREIGN KEY ("ppoOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
