/**
 * Обновляет права существующих ролей сотрудников до эталонных из seed-staff-roles.
 * Использование: pnpm tsx scripts/migrate-role-permissions-to-defaults.ts [--dry-run] [--org-id=ID] [--all-types]
 * --dry-run: только показать, что будет изменено
 * --org-id=ID: только для одной организации
 * --all-types: обновлять не только ППО (по умолчанию только PRIMARY)
 */

import { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLES } from "../prisma/seed-staff-roles";
import { normalizeStaffPermissions } from "../lib/staff-permission-matrix";

const prisma = new PrismaClient();

function normalizeRoleName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

const nameToDefault = new Map(DEFAULT_ROLES.map((r) => [r.name, r]));
const normalizedNameToDefault = new Map(
  DEFAULT_ROLES.map((r) => [normalizeRoleName(r.name), r])
);

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allTypes = args.includes("--all-types");
  const orgIdArg = args.find((a) => a.startsWith("--org-id="));
  const singleOrgId = orgIdArg ? orgIdArg.replace("--org-id=", "").trim() : null;

  if (dryRun) {
    console.log("Режим --dry-run: изменения не применяются.\n");
  }

  const organizations = await prisma.organization.findMany({
    where: {
      isActive: true,
      ...(allTypes ? {} : { type: "PRIMARY" }),
      ...(singleOrgId ? { id: singleOrgId } : {}),
    },
    select: { id: true, name: true, type: true },
  });

  if (organizations.length === 0) {
    console.log("Организации не найдены.");
    return;
  }

  let totalUpdated = 0;

  for (const org of organizations) {
    const roles = await prisma.staffRole.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        name: true,
        permissions: true,
        description: true,
        isElectedBody: true,
        isManagement: true,
      },
    });

    for (const role of roles) {
      const def =
        nameToDefault.get(role.name) ||
        normalizedNameToDefault.get(normalizeRoleName(role.name));
      if (!def) continue;

      const newPermissions = normalizeStaffPermissions(def.permissions);
      const currentPerms = normalizeStaffPermissions(role.permissions);
      const permsEqual =
        Object.keys(newPermissions).length === Object.keys(currentPerms).length &&
        (Object.keys(newPermissions) as (keyof typeof newPermissions)[]).every(
          (k) => currentPerms[k] === newPermissions[k]
        );
      const descEqual = (role.description || "") === (def.description || "");
      const electedEqual = role.isElectedBody === (def.isElectedBody ?? false);
      const managementEqual = role.isManagement === (def.isManagement ?? false);

      if (permsEqual && descEqual && electedEqual && managementEqual) {
        continue;
      }

      const assignedCount = await prisma.organizationStaff.count({
        where: { roleId: role.id, status: { in: ["ACTIVE", "PENDING", "INACTIVE"] } },
      });
      console.log(
        `[${org.name}] Роль "${role.name}" (сотрудников: ${assignedCount}): обновление permissions/description/isElectedBody/isManagement`
      );
      totalUpdated++;

      if (!dryRun) {
        await prisma.staffRole.update({
          where: { id: role.id },
          data: {
            permissions: newPermissions as object,
            description: def.description,
            isElectedBody: def.isElectedBody ?? false,
            isManagement: def.isManagement ?? false,
          },
        });
      }
    }
  }

  console.log(
    dryRun
      ? `\nГотово (dry-run): было бы обновлено ролей: ${totalUpdated}`
      : `\nОбновлено ролей: ${totalUpdated}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
