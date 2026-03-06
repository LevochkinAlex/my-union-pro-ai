/**
 * Скрипт для диагностики и исправления повреждённых имён пользователей
 * Запуск: npx tsx scripts/fix-user-names.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ДИАГНОСТИКА ПОЛЬЗОВАТЕЛЯ talik.e@mail.ru ===\n");

  const user = await prisma.user.findFirst({
    where: { email: { equals: "talik.e@mail.ru", mode: "insensitive" } },
    include: {
      organization: { select: { id: true, name: true, type: true } },
    },
  });

  if (!user) {
    console.log("Пользователь не найден!");
    return;
  }

  console.log("ID:", user.id);
  console.log("firstName:", JSON.stringify(user.firstName));
  console.log("lastName:", JSON.stringify(user.lastName));
  console.log("middleName:", JSON.stringify(user.middleName));
  console.log("email:", user.email);
  console.log("phone:", user.phone);
  console.log("role:", user.role);
  console.log("membershipStatus:", user.membershipStatus);
  console.log("telegramChatId:", user.telegramChatId);
  console.log("telegramUsername:", user.telegramUsername);
  console.log("organizationId:", user.organizationId);
  console.log("organization:", user.organization?.name, `(${user.organization?.type})`);
  console.log("ppoHeadOrganizationId:", user.ppoHeadOrganizationId);
  console.log("mpoHeadOrganizationId:", user.mpoHeadOrganizationId);
  console.log("rpoHeadOrganizationId:", user.rpoHeadOrganizationId);

  // Где он председатель
  if (user.ppoHeadOrganizationId) {
    const ppoOrg = await prisma.organization.findUnique({
      where: { id: user.ppoHeadOrganizationId },
      select: { name: true, type: true, chairmanName: true },
    });
    console.log("\n--- Председатель ППО ---");
    console.log("Организация:", ppoOrg?.name, `(${ppoOrg?.type})`);
    console.log("chairmanName на org:", ppoOrg?.chairmanName);
  }

  if (user.rpoHeadOrganizationId) {
    const rpoOrg = await prisma.organization.findUnique({
      where: { id: user.rpoHeadOrganizationId },
      select: { name: true, type: true, chairmanName: true },
    });
    console.log("\n--- Председатель РПО ---");
    console.log("Организация:", rpoOrg?.name, `(${rpoOrg?.type})`);
    console.log("chairmanName на org:", rpoOrg?.chairmanName);
  }

  // Ищем все организации, где этот юзер = chairmanUser
  const orgsAsChairman = await prisma.organization.findMany({
    where: {
      OR: [
        { chairmanName: { contains: user.email ?? "___", mode: "insensitive" } },
        { chairmanName: { contains: "Талик", mode: "insensitive" } },
        { chairmanName: { contains: "Еременко", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, type: true, chairmanName: true },
  });

  if (orgsAsChairman.length > 0) {
    console.log("\n--- Организации где chairmanName содержит данные пользователя ---");
    for (const org of orgsAsChairman) {
      console.log(`  ${org.name} (${org.type}): chairmanName = "${org.chairmanName}"`);
    }
  }

  // === ПОИСК ВСЕХ ПОЛЬЗОВАТЕЛЕЙ С ПОВРЕЖДЁННЫМИ ИМЕНАМИ ===
  console.log("\n\n=== ВСЕ ПОЛЬЗОВАТЕЛИ С ЛАТИНИЦЕЙ В ИМЕНАХ ===\n");

  const allUsers = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { not: null } },
        { lastName: { not: null } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      email: true,
      telegramUsername: true,
      role: true,
    },
  });

  const hasLatin = (s: string | null) => s && /[a-zA-Z]/.test(s);
  const corrupted = allUsers.filter(
    (u) => hasLatin(u.firstName) || hasLatin(u.lastName),
  );

  console.log(`Всего пользователей с именами: ${allUsers.length}`);
  console.log(`Из них с латиницей в firstName/lastName: ${corrupted.length}\n`);

  for (const u of corrupted) {
    const name = [u.lastName, u.firstName, u.middleName].filter(Boolean).join(" ");
    console.log(`  [${u.role}] ${name} | email: ${u.email || "—"} | tg: ${u.telegramUsername || "—"}`);
  }

  // === ИСПРАВЛЕНИЕ КОНКРЕТНОГО ПОЛЬЗОВАТЕЛЯ ===
  if (process.argv.includes("--fix")) {
    console.log("\n\n=== ИСПРАВЛЕНИЕ talik.e@mail.ru ===\n");

    const correctLastName = "Еременко";
    const correctFirstName = "Виталий";
    const correctMiddleName = "Николаевич";
    const correctChairmanName = "Еременко Виталий Николаевич";

    console.log(`Было: "${user.lastName}" "${user.firstName}" "${user.middleName}"`);
    console.log(`Будет: "${correctLastName}" "${correctFirstName}" "${correctMiddleName}"`);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: correctFirstName,
        lastName: correctLastName,
        middleName: correctMiddleName,
      },
    });
    console.log("✅ Имя пользователя исправлено");

    // Обновляем chairmanName на организациях
    if (user.ppoHeadOrganizationId) {
      await prisma.organization.update({
        where: { id: user.ppoHeadOrganizationId },
        data: { chairmanName: correctChairmanName },
      });
      console.log("✅ chairmanName обновлён на ППО");
    }
    if (user.rpoHeadOrganizationId) {
      await prisma.organization.update({
        where: { id: user.rpoHeadOrganizationId },
        data: { chairmanName: correctChairmanName },
      });
      console.log("✅ chairmanName обновлён на РПО");
    }
  } else {
    console.log("\n\nДля исправления запустите: npx tsx scripts/fix-user-names.ts --fix");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
