-- Статус заявки на участие (по умолчанию NEW = «Новая»)
CREATE TYPE "PartnerVenueApplicationStatus" AS ENUM ('NEW');

ALTER TABLE "PartnerVenueApplication"
ADD COLUMN "status" "PartnerVenueApplicationStatus" NOT NULL DEFAULT 'NEW';

CREATE INDEX "PartnerVenueApplication_status_idx" ON "PartnerVenueApplication"("status");
