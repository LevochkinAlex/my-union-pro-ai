/**
 * Приводит в соответствие поля organization/workplace у председателей ППО:
 * - organizationId = ppoHeadOrganizationId
 * - organizationName = название ППО
 * - workplace = название ППО
 * - workplaceInn = ИНН ППО (или null)
 *
 * Запуск:
 *   npx tsx scripts/reconcile-ppo-head-organization.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      isPPOHead: true,
      ppoHeadOrganizationId: { not: null },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      organizationId: true,
      workplace: true,
      workplaceInn: true,
      ppoHeadOrganizationId: true,
    },
  });

  let updated = 0;
  for (const user of users) {
    const orgId = user.ppoHeadOrganizationId;
    if (!orgId) continue;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, inn: true },
    });
    if (!org) continue;

    const needsUpdate =
      user.organizationId !== org.id ||
      user.workplace !== org.name ||
      (user.workplaceInn ?? null) !== (org.inn ?? null);

    if (!needsUpdate) continue;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        organizationId: org.id,
        organizationName: org.name,
        workplace: org.name,
        workplaceInn: org.inn ?? null,
      },
    });
    updated += 1;

    const fullName = [user.lastName, user.firstName].filter(Boolean).join(" ");
    console.log(`Updated: ${user.email ?? user.id} (${fullName || "без имени"}) -> ${org.name}`);
  }

  console.log(`Done. Updated users: ${updated}/${users.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

