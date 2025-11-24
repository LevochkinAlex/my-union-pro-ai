/**
 * Скрипт для получения ID пользователя по email
 * Запуск: pnpm tsx scripts/get-user-id.ts <email>
 */

import { prisma } from "../lib/prisma";

async function getUserId(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь не найден: ${email}`);
      process.exit(1);
    }

    console.log(`\n✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Имя: ${user.firstName || "N/A"} ${user.lastName || "N/A"}\n`);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error("❌ Использование: pnpm tsx scripts/get-user-id.ts <email>");
  process.exit(1);
}

getUserId(email);

