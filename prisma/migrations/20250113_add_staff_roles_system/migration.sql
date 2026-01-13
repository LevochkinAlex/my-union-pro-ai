-- CreateEnum: StaffStatus (статус сотрудника)
CREATE TYPE "StaffStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- AlterEnum: OrganizationType (добавляем LOCAL)
ALTER TYPE "OrganizationType" ADD VALUE 'LOCAL';

-- CreateTable: StaffRole (роли сотрудников)
CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrganizationStaff (сотрудники организации)
CREATE TABLE "OrganizationStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "StaffStatus" NOT NULL DEFAULT 'PENDING',
    "inviteToken" TEXT,
    "inviteExpires" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "tempPassword" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StaffInvitation (история приглашений)
CREATE TABLE "StaffInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "roleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: StaffRole
CREATE UNIQUE INDEX "StaffRole_organizationId_name_key" ON "StaffRole"("organizationId", "name");
CREATE INDEX "StaffRole_organizationId_idx" ON "StaffRole"("organizationId");
CREATE INDEX "StaffRole_isActive_idx" ON "StaffRole"("isActive");

-- CreateIndex: OrganizationStaff
CREATE UNIQUE INDEX "OrganizationStaff_inviteToken_key" ON "OrganizationStaff"("inviteToken");
CREATE UNIQUE INDEX "OrganizationStaff_userId_organizationId_key" ON "OrganizationStaff"("userId", "organizationId");
CREATE INDEX "OrganizationStaff_userId_idx" ON "OrganizationStaff"("userId");
CREATE INDEX "OrganizationStaff_organizationId_idx" ON "OrganizationStaff"("organizationId");
CREATE INDEX "OrganizationStaff_roleId_idx" ON "OrganizationStaff"("roleId");
CREATE INDEX "OrganizationStaff_status_idx" ON "OrganizationStaff"("status");
CREATE INDEX "OrganizationStaff_inviteToken_idx" ON "OrganizationStaff"("inviteToken");

-- CreateIndex: StaffInvitation
CREATE UNIQUE INDEX "StaffInvitation_token_key" ON "StaffInvitation"("token");
CREATE INDEX "StaffInvitation_organizationId_idx" ON "StaffInvitation"("organizationId");
CREATE INDEX "StaffInvitation_token_idx" ON "StaffInvitation"("token");
CREATE INDEX "StaffInvitation_email_idx" ON "StaffInvitation"("email");
CREATE INDEX "StaffInvitation_status_idx" ON "StaffInvitation"("status");

-- AddForeignKey: StaffRole
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: OrganizationStaff
ALTER TABLE "OrganizationStaff" ADD CONSTRAINT "OrganizationStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationStaff" ADD CONSTRAINT "OrganizationStaff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationStaff" ADD CONSTRAINT "OrganizationStaff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: StaffInvitation
ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
