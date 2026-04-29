-- CreateEnum
CREATE TYPE "PartnerVenueParticipationMode" AS ENUM ('PROMO_CODE', 'APPLICATION');

-- AlterTable
ALTER TABLE "PartnerVenue" ADD COLUMN "participationMode" "PartnerVenueParticipationMode" NOT NULL DEFAULT 'PROMO_CODE';
