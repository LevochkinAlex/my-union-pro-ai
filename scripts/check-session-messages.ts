/**
 * Проверка сообщений в конкретной сессии
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SESSION_ID = "cmidgy3gy0004ptg7zn6v04np";

async function checkSessionMessages() {
  console.log(`🔍 Проверка сессии: ${SESSION_ID}\n`);

  try {
    // Получаем информацию о сессии
    const session = await prisma.chatSession.findUnique({
      where: { id: SESSION_ID },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!session) {
      console.log("❌ Сессия не найдена!");
      return;
    }

    console.log("✅ Сессия найдена:");
    console.log(`   Пользователь: ${session.user.firstName} ${session.user.lastName} (${session.user.email})`);
    console.log(`   Тип: ${session.type}`);
    console.log(`   Создана: ${session.createdAt.toISOString()}\n`);

    // Получаем все сообщения
    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId: SESSION_ID,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log(`📨 Всего сообщений: ${messages.length}\n`);
    console.log("=".repeat(80));

    // Выводим все сообщения
    messages.forEach((msg, index) => {
      console.log(`\n[${index + 1}] ${msg.role.toUpperCase()} (${msg.createdAt.toISOString()})`);
      console.log(`ID: ${msg.id}`);
      console.log(`Содержание:`);
      console.log(msg.content);
      console.log("-".repeat(80));
    });

    // Ищем сообщения об организации
    console.log("\n🔍 Поиск сообщений об организациях:");
    const orgMessages = messages.filter(
      (m) =>
        m.content.toLowerCase().includes("организац") ||
        m.content.toLowerCase().includes("бсмп") ||
        m.content.toLowerCase().includes("больница")
    );

    if (orgMessages.length > 0) {
      console.log(`\n✅ Найдено ${orgMessages.length} сообщений:`);
      orgMessages.forEach((msg) => {
        console.log(`\n   ID: ${msg.id}`);
        console.log(`   Роль: ${msg.role}`);
        console.log(`   Фрагмент: ${msg.content.substring(0, 200)}...`);
      });
    } else {
      console.log("\n❌ Сообщений об организации не найдено");
    }
  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkSessionMessages()
  .then(() => {
    console.log("\n✅ Проверка завершена");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  });

