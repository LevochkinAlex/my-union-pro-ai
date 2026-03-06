import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

const prisma = new PrismaClient();

function hashPermissions(input: unknown): string {
  const normalized = normalizeStaffPermissions(input);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

async function run() {
  const rpoId = process.argv[2];
  if (!rpoId) {
    throw new Error("Usage: tsx scripts/bootstrap-rpo-role-templates.ts <rpoOrganizationId>");
  }

  const rpoOrganization = await prisma.organization.findUnique({
    where: { id: rpoId },
    select: { id: true, name: true, type: true },
  });

  if (!rpoOrganization || rpoOrganization.type !== "REGIONAL") {
    throw new Error("Передан некорректный RPO organizationId");
  }

  const scopeOrganizations = await prisma.organization.findMany({
    where: {
      OR: [{ id: rpoOrganization.id }, { parentId: rpoOrganization.id }],
      isActive: true,
    },
    select: { id: true, type: true },
  });

  const ppoIds = scopeOrganizations
    .filter((org) => org.type === "PRIMARY")
    .map((org) => org.id);

  const roles = await prisma.staffRole.findMany({
    where: {
      organizationId: { in: ppoIds },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      isElectedBody: true,
      isManagement: true,
    },
    orderBy: [{ name: "asc" }],
  });

  const groupedByHash = new Map<string, typeof roles>();
  for (const role of roles) {
    const hash = hashPermissions(role.permissions);
    const list = groupedByHash.get(hash) || [];
    list.push(role);
    groupedByHash.set(hash, list);
  }

  const mapping: Array<{
    permissionHash: string;
    templateRoleId: string;
    sourceRoleIds: string[];
    templateName: string;
  }> = [];

  for (const [permissionHash, sourceRoles] of groupedByHash.entries()) {
    const [first] = sourceRoles;
    const templateName = first.name;
    const templateRole = await prisma.staffRole.upsert({
      where: {
        organizationId_name: {
          organizationId: rpoOrganization.id,
          name: templateName,
        },
      },
      update: {
        description: first.description || "Шаблон роли РПО",
        permissions: normalizeStaffPermissions(first.permissions),
        isSystem: false,
        isActive: true,
        isElectedBody: first.isElectedBody,
        isManagement: first.isManagement,
      },
      create: {
        organizationId: rpoOrganization.id,
        name: templateName,
        description: first.description || "Шаблон роли РПО",
        permissions: normalizeStaffPermissions(first.permissions),
        isSystem: false,
        isActive: true,
        isElectedBody: first.isElectedBody,
        isManagement: first.isManagement,
      },
      select: { id: true, name: true },
    });

    mapping.push({
      permissionHash,
      templateRoleId: templateRole.id,
      sourceRoleIds: sourceRoles.map((item) => item.id),
      templateName: templateRole.name,
    });
  }

  console.log(
    JSON.stringify(
      {
        rpoOrganizationId: rpoOrganization.id,
        templatesCreatedOrUpdated: mapping.length,
        mapping,
      },
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error("[bootstrap-rpo-role-templates] error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

