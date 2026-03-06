/**
 * Восстановление целостности: talik.e@mail.ru должен быть членом и председателем
 * ППО Аппарат МООП РЗ РФ, место работы — то же.
 * Запуск: npx tsx scripts/fix-talik-organization.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = "talik.e@mail.ru";
const MOOP_ORG_NAME_PATTERN = "Аппарат МООП"; // часть названия ППО Аппарат МООП РЗ РФ

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
    include: {
      organization: true,
      ppoHeadOrganization: true,
    },
  });

  if (!user) {
    console.log("Пользователь не найден:", EMAIL);
    return;
  }

  const ppoHeadId = user.ppoHeadOrganizationId;
  if (!ppoHeadId) {
    console.log("У пользователя не задана организация председателя (ppoHeadOrganizationId). Нечего исправлять.");
    return;
  }

  const moopOrg = await prisma.organization.findUnique({
    where: { id: ppoHeadId },
    select: { id: true, name: true, inn: true },
  });

  if (!moopOrg) {
    console.log("Организация председателя не найдена по id:", ppoHeadId);
    return;
  }

  if (!moopOrg.name.includes(MOOP_ORG_NAME_PATTERN)) {
    console.log("Организация председателя не похожа на Аппарат МООП:", moopOrg.name);
    return;
  }

  console.log("Текущее состояние:");
  console.log("  organizationId:", user.organizationId, "→", user.organization?.name ?? "—");
  console.log("  ppoHeadOrganizationId:", user.ppoHeadOrganizationId, "→", moopOrg.name);
  console.log("  workplace:", user.workplace ?? "—");
  console.log("  workplaceInn:", user.workplaceInn ?? "—");
  console.log("  organizationName:", user.organizationName ?? "—");

  // Место работы и ИНН — только из организации Аппарат МООП; не оставляем ИНН МОНИКИ
  const updates: Record<string, unknown> = {
    organizationId: moopOrg.id,
    organizationName: moopOrg.name,
    workplace: moopOrg.name,
    workplaceInn: moopOrg.inn ?? null,
  };

  await prisma.user.update({
    where: { id: user.id },
    data: updates,
  });

  console.log("\nОбновлено:");
  console.log("  organizationId →", moopOrg.id, "(", moopOrg.name, ")");
  console.log("  organizationName →", moopOrg.name);
  console.log("  workplace →", moopOrg.name);
  console.log("  workplaceInn →", moopOrg.inn ?? "(без изменений)");
  console.log("\nГотово. Пользователь теперь и член, и председатель ППО Аппарат МООП РЗ РФ, место работы совпадает.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
