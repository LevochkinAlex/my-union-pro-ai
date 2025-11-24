-- AlterTable
ALTER TABLE "User" ADD COLUMN "profileChangedAfterDocuments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "profileLastModified" TIMESTAMP(3);

