/**
 * Очистка всех сессий пользователя для чистого теста
 */

import { prisma } from "../lib/prisma";

const TEST_EMAIL = "ceo@yappix.ru";

async function clearSessions() {
  console.log("\n🧹 ОЧИСТКА СЕССИЙ ПОЛЬЗОВАТЕЛЯ\n");
  console.log("═".repeat(70));
  
  const user = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
  });

  if (!user) {
    console.log("❌ Пользователь не найден");
    return;
  }

  console.log(`👤 User: ${user.email} (ID: ${user.id})\n`);

  // Удаляем все сообщения
  const deletedMessages = await prisma.chatMessage.deleteMany({
    where: { userId: user.id },
  });
  
  console.log(`🗑️  Удалено сообщений: ${deletedMessages.count}`);

  // Удаляем все сессии
  const deletedSessions = await prisma.chatSession.deleteMany({
    where: { userId: user.id },
  });
  
  console.log(`🗑️  Удалено сессий: ${deletedSessions.count}`);

  // Очищаем профиль пользователя (кроме основных полей)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName: null,
      lastName: null,
      middleName: null,
      dateOfBirth: null,
      address: null,
      phone: null,
      jobTitle: null,
      profession: null,
      education: null,
      region: null,
      organizationId: null,
      organizationName: null,
    },
  });

  console.log("✅ Профиль очищен");
  console.log("\n" + "═".repeat(70));
  console.log("✅ ГОТОВО! Теперь можно начать чистый тест");
}

clearSessions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

