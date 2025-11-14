import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetChatSession(sessionId: string) {
  console.log(`Начинаем сброс диалога для сессии: ${sessionId}`);

  try {
    // Проверяем, что сессия существует
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: true,
      },
    });

    if (!session) {
      console.error(`❌ Сессия ${sessionId} не найдена`);
      process.exit(1);
    }

    console.log(`Найдена сессия: ${session.title} (${session.type})`);
    console.log(`Сообщений в сессии: ${session.messages.length}`);

    // Удаляем все сообщения из сессии
    const deleteResult = await prisma.chatMessage.deleteMany({
      where: {
        sessionId: sessionId,
      },
    });

    console.log(`✅ Удалено сообщений: ${deleteResult.count}`);

    // При следующей загрузке сессии автоматически создастся новое приветственное сообщение
    console.log(`✅ Сессия очищена. При следующей загрузке будет создано новое приветственное сообщение.`);
  } catch (error) {
    console.error("Ошибка при сбросе диалога:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Получаем sessionId из аргументов командной строки
const sessionId = process.argv[2];

if (!sessionId) {
  console.error("❌ Укажите ID сессии как аргумент:");
  console.error("   pnpm tsx scripts/reset-chat-session.ts <sessionId>");
  process.exit(1);
}

resetChatSession(sessionId)
  .then(() => {
    console.log("✅ Сброс завершен успешно");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  });

