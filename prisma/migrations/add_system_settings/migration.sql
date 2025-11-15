-- CreateTable "SystemSettings"
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "oneSignalAppId" TEXT,
    "oneSignalRestApiKey" TEXT,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);
