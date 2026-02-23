-- Add invited guests free-form field for meeting protocol step
ALTER TABLE "Meeting"
ADD COLUMN IF NOT EXISTS "invitedGuests" TEXT;
