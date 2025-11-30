import { prisma } from "../lib/prisma";
import { normalizePhone } from "../lib/utils/phone";

const phone = process.argv[2];

if (!phone) {
  console.error("❌ Укажите номер телефона: pnpm tsx scripts/fix-user-chat-messages.ts +79032911816");
  process.exit(1);
}

async function fixChatMessages() {
  try {
    const normalizedPhone = normalizePhone(phone);
    console.log(`\n🔍 Ищем пользователя с номером: ${phone}\n`);

    // Ищем пользователя
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: phone },
          { authPhone: normalizedPhone },
          { authPhone: phone },
        ],
      },
    });

    if (!user) {
      console.log("❌ Пользователь не найден!");
      process.exit(1);
    }

    console.log(`✅ Пользователь найден: ${user.firstName} ${user.lastName} (ID: ${user.id})\n`);

    // Находим сессию "Мой чат"
    const statementSession = await prisma.chatSession.findFirst({
      where: {
        userId: user.id,
        type: "STATEMENT",
      },
      orderBy: { createdAt: "asc" },
    });

    if (!statementSession) {
      console.log("❌ Сессия 'Мой чат' не найдена!");
      process.exit(1);
    }

    console.log(`✅ Сессия найдена: ${statementSession.id}\n`);

    // Получаем все сообщения сессии
    const allMessages = await prisma.chatMessage.findMany({
      where: {
        sessionId: statementSession.id,
        userId: user.id,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`📋 Всего сообщений в сессии: ${allMessages.length}\n`);

    // Показываем текущие сообщения
    console.log("📨 Текущие сообщения:");
    allMessages.forEach((msg, idx) => {
      const preview = msg.content.substring(0, 80).replace(/\n/g, " ");
      const isSystem = msg.isSystemMessage ? "🔔 СИСТЕМНОЕ" : msg.role === "assistant" ? "🤖 БОТ" : "👤 ПОЛЬЗОВАТЕЛЬ";
      console.log(`   ${idx + 1}. [${isSystem}] ${msg.createdAt.toISOString()}: ${preview}...`);
    });

    // Определяем какие сообщения нужно оставить
    // 1. Приветственное сообщение (первое сообщение от assistant, не системное)
    // 2. Сообщение о заполнении анкеты с [GENERATE_DOCUMENTS_BUTTON]
    // 3. Сообщение о генерации документов
    // 4. Инструкция по загрузке документов

    const messagesToKeep: string[] = [];
    const messagesToDelete: string[] = [];

    // Находим приветственное сообщение (первое не системное от assistant)
    const welcomeMessage = allMessages.find(
      (msg) => msg.role === "assistant" && !msg.isSystemMessage && msg.content.includes("Здравствуйте")
    );
    if (welcomeMessage) {
      messagesToKeep.push(welcomeMessage.id);
      console.log(`\n✅ Оставляем приветственное сообщение: ${welcomeMessage.id}`);
    }

    // Находим сообщение о заполнении анкеты
    const profileCompletedMsg = allMessages.find(
      (msg) => msg.isSystemMessage && msg.content.includes("[GENERATE_DOCUMENTS_BUTTON]")
    );
    if (profileCompletedMsg) {
      messagesToKeep.push(profileCompletedMsg.id);
      console.log(`✅ Оставляем сообщение о заполнении анкеты: ${profileCompletedMsg.id}`);
    }

    // Находим сообщение о генерации документов
    const documentsGeneratedMsg = allMessages.find(
      (msg) => msg.isSystemMessage && msg.content.includes("Готово, ваши документы сгенерированы")
    );
    if (documentsGeneratedMsg) {
      messagesToKeep.push(documentsGeneratedMsg.id);
      console.log(`✅ Оставляем сообщение о генерации документов: ${documentsGeneratedMsg.id}`);
    }

    // Находим инструкцию по загрузке
    const uploadInstructionMsg = allMessages.find(
      (msg) => msg.isSystemMessage && msg.content.includes("Вы можете прикрепить подписанные документы")
    );
    if (uploadInstructionMsg) {
      messagesToKeep.push(uploadInstructionMsg.id);
      console.log(`✅ Оставляем инструкцию по загрузке: ${uploadInstructionMsg.id}`);
    }

    // Все остальные системные сообщения удаляем
    allMessages.forEach((msg) => {
      if (msg.isSystemMessage && !messagesToKeep.includes(msg.id)) {
        messagesToDelete.push(msg.id);
        console.log(`❌ Удаляем: ${msg.id} - ${msg.content.substring(0, 50)}...`);
      } else if (!msg.isSystemMessage && msg.role !== "user") {
        // Оставляем пользовательские сообщения и приветствие
        if (!welcomeMessage || msg.id !== welcomeMessage.id) {
          // Если это не приветствие и не пользовательское - удаляем
          if (msg.role === "assistant" && !messagesToKeep.includes(msg.id)) {
            messagesToDelete.push(msg.id);
            console.log(`❌ Удаляем сообщение бота: ${msg.id}`);
          }
        }
      }
    });

    // Удаляем лишние сообщения
    if (messagesToDelete.length > 0) {
      console.log(`\n🗑️  Удаляем ${messagesToDelete.length} сообщений...`);
      await prisma.chatMessage.deleteMany({
        where: {
          id: { in: messagesToDelete },
        },
      });
      console.log(`✅ Удалено ${messagesToDelete.length} сообщений\n`);
    } else {
      console.log("\n✅ Нет сообщений для удаления\n");
    }

    // Проверяем результат
    const remainingMessages = await prisma.chatMessage.findMany({
      where: {
        sessionId: statementSession.id,
        userId: user.id,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log("📨 Оставшиеся сообщения:");
    remainingMessages.forEach((msg, idx) => {
      const preview = msg.content.substring(0, 80).replace(/\n/g, " ");
      const isSystem = msg.isSystemMessage ? "🔔 СИСТЕМНОЕ" : msg.role === "assistant" ? "🤖 БОТ" : "👤 ПОЛЬЗОВАТЕЛЬ";
      console.log(`   ${idx + 1}. [${isSystem}] ${msg.createdAt.toISOString()}: ${preview}...`);
    });

    console.log("\n✅ Готово! Чат очищен согласно сценарию.\n");
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

fixChatMessages();

