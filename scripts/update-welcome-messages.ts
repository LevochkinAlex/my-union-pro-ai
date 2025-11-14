import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function updateWelcomeMessages() {
  console.log("Начинаем обновление приветственных сообщений...");

  try {
    // Находим все старые приветственные сообщения
    const oldWelcomeMessages = await prisma.chatMessage.findMany({
      where: {
        role: "assistant",
        content: {
          contains: "Я — ваш персональный ассистент MyUnion Pro",
        },
      },
      include: {
        session: true,
      },
    });

    console.log(`Найдено старых приветственных сообщений: ${oldWelcomeMessages.length}`);

    let updated = 0;
    let skipped = 0;

    for (const msg of oldWelcomeMessages) {
      // Определяем новое сообщение в зависимости от типа сессии
      const newContent = msg.session?.type === "APPEAL"
        ? "Здравствуйте! Я ваш помощник по обращениям в профсоюз. Я могу помочь вам с вопросами по различным направлениям: бухгалтерия, юридические вопросы, технические вопросы и другие. Опишите, пожалуйста, ваше обращение или вопрос, и я постараюсь вам помочь."
        : "Здравствуйте! Я ваш помощник для вступления в Профсоюз работников здравоохранения РФ. Я помогу вам заполнить профиль и подготовить необходимые документы для этого. Давайте начнем. Укажите регион России, в которой вы находитесь.";

      // Обновляем сообщение только если оно старое
      if (msg.content.includes("Я — ваш персональный ассистент MyUnion Pro")) {
        await prisma.chatMessage.update({
          where: { id: msg.id },
          data: { content: newContent },
        });
        updated++;
        console.log(`✅ Обновлено сообщение ${msg.id} для сессии ${msg.sessionId}`);
      } else {
        skipped++;
      }
    }

    console.log("\n=== Результаты ===");
    console.log(`Обновлено: ${updated}`);
    console.log(`Пропущено: ${skipped}`);
    console.log(`Всего обработано: ${oldWelcomeMessages.length}`);
  } catch (error) {
    console.error("Ошибка при обновлении сообщений:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateWelcomeMessages()
  .then(() => {
    console.log("✅ Обновление завершено успешно");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  });

