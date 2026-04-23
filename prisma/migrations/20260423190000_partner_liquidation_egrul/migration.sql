-- Partner: ЕГРЮЛ / автоблокировка при ликвидации
ALTER TABLE "Partner" ADD COLUMN "egrulStatusText" TEXT;
ALTER TABLE "Partner" ADD COLUMN "egrulCheckedAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN "liquidationAutoBlockedAt" TIMESTAMP(3);

CREATE INDEX "Partner_liquidationAutoBlockedAt_idx" ON "Partner"("liquidationAutoBlockedAt");
CREATE INDEX "Partner_egrulCheckedAt_idx" ON "Partner"("egrulCheckedAt");
