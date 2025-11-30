import { prisma } from "../lib/prisma";

const sessionId = process.argv[2];

if (!sessionId) {
  console.error("❌ Укажите ID сессии: pnpm tsx scripts/fix-welcome-message-button.ts cmima6eqo0006pt0ce4ckq7ny");
  process.exit(1);
}

async function fixWelcomeMessage() {
  try {
    console.log(`\n🔍 Проверяем сессию: ${sessionId}\n`);

    // Находим сессию
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      console.log("❌ Сессия не найдена!");
      process.exit(1);
    }

    console.log(`✅ Сессия найдена: ${session.title} (${session.type})\n`);

    // Ищем приветственное сообщение
    const welcomeMsg = session.messages.find(
      (msg) => msg.role === "assistant" && 
      msg.content.includes("Здравствуйте! 👋") && 
      !msg.isSystemMessage
    );

    if (!welcomeMsg) {
      console.log("❌ Приветственное сообщение не найдено!");
      process.exit(1);
    }

    console.log(`📨 Найдено приветственное сообщение:`);
    console.log(`   ID: ${welcomeMsg.id}`);
    console.log(`   Содержит [SHOW_SELF_FILL_BUTTON]: ${welcomeMsg.content.includes("[SHOW_SELF_FILL_BUTTON]")}`);
    console.log(`   Текст: ${welcomeMsg.content.substring(0, 100)}...\n`);

    if (!welcomeMsg.content.includes("[SHOW_SELF_FILL_BUTTON]")) {
      console.log("🔧 Обновляем сообщение, добавляя маркер кнопки...");
      
      const welcomeMessageContent = `Здравствуйте! 👋 Я AI-помощник профсоюза МООП РЗ.

Подайте заявление о вступлении в профсоюз, заполнив анкету.

[SHOW_SELF_FILL_BUTTON]`;

      await prisma.chatMessage.update({
        where: { id: welcomeMsg.id },
        data: { content: welcomeMessageContent },
      });

      console.log("✅ Сообщение обновлено с маркером [SHOW_SELF_FILL_BUTTON]\n");
    } else {
      console.log("✅ Сообщение уже содержит маркер [SHOW_SELF_FILL_BUTTON]\n");
    }

    // Проверяем количество несистемных сообщений
    const userMessagesCount = await prisma.chatMessage.count({
      where: {
        sessionId: session.id,
        userId: session.userId,
        isSystemMessage: false,
      },
    });

    console.log(`📊 Статистика:`);
    console.log(`   Всего сообщений: ${session.messages.length}`);
    console.log(`   Несистемных сообщений: ${userMessagesCount}`);
    console.log(`   Это первый вход: ${userMessagesCount === 0 ? "✅ ДА" : "❌ НЕТ"}\n`);

    console.log("✅ Готово!\n");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    if (error instanceof Error) {
      console.error("   Сообщение:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixWelcomeMessage();

