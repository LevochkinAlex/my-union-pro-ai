import { prisma } from "../lib/prisma";
import { normalizePhone } from "../lib/utils/phone";
import { SystemMessages } from "../lib/system-messages";

const phone = process.argv[2];

if (!phone) {
  console.error("❌ Укажите номер телефона: pnpm tsx scripts/fix-user-chat-messages-v2.ts +79032911816");
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

    // Находим или создаем сессию "Мой чат"
    let statementSession = await prisma.chatSession.findFirst({
      where: {
        userId: user.id,
        type: "STATEMENT",
      },
      orderBy: { createdAt: "asc" },
    });

    if (!statementSession) {
      console.log("📝 Создаем сессию 'Мой чат'...");
      statementSession = await prisma.chatSession.create({
        data: {
          userId: user.id,
          title: "Мой чат",
          type: "STATEMENT",
        },
      });
      console.log(`✅ Сессия создана: ${statementSession.id}\n`);
    } else {
      console.log(`✅ Сессия найдена: ${statementSession.id}\n`);
    }

    // Получаем ВСЕ сообщения пользователя (включая без sessionId)
    const allUserMessages = await prisma.chatMessage.findMany({
      where: {
        userId: user.id,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`📋 Всего сообщений пользователя: ${allUserMessages.length}\n`);

    // Показываем текущие сообщения
    console.log("📨 Текущие сообщения пользователя:");
    allUserMessages.forEach((msg, idx) => {
      const preview = msg.content.substring(0, 80).replace(/\n/g, " ");
      const isSystem = msg.isSystemMessage ? "🔔 СИСТЕМНОЕ" : msg.role === "assistant" ? "🤖 БОТ" : "👤 ПОЛЬЗОВАТЕЛЬ";
      const sessionInfo = msg.sessionId ? `[сессия: ${msg.sessionId.substring(0, 8)}...]` : "[без сессии]";
      console.log(`   ${idx + 1}. [${isSystem}] ${sessionInfo} ${msg.createdAt.toISOString()}: ${preview}...`);
    });

    // Удаляем ВСЕ старые системные сообщения
    console.log("\n🗑️  Удаляем все старые системные сообщения...");
    const deleted = await prisma.chatMessage.deleteMany({
      where: {
        userId: user.id,
        isSystemMessage: true,
      },
    });
    console.log(`✅ Удалено ${deleted.count} системных сообщений\n`);

    // Удаляем старые сообщения бота (кроме приветствия)
    const botMessages = await prisma.chatMessage.findMany({
      where: {
        userId: user.id,
        role: "assistant",
        isSystemMessage: false,
      },
    });

    const welcomeMessage = botMessages.find((msg) => msg.content.includes("Здравствуйте"));
    if (welcomeMessage) {
      console.log("✅ Оставляем приветственное сообщение");
      // Обновляем sessionId если нужно
      if (welcomeMessage.sessionId !== statementSession.id) {
        await prisma.chatMessage.update({
          where: { id: welcomeMessage.id },
          data: { sessionId: statementSession.id },
        });
        console.log("   ✅ Привязано к сессии");
      }
    }

    // Удаляем остальные сообщения бота
    const otherBotMessages = botMessages.filter((msg) => msg.id !== welcomeMessage?.id);
    if (otherBotMessages.length > 0) {
      await prisma.chatMessage.deleteMany({
        where: {
          id: { in: otherBotMessages.map((m) => m.id) },
        },
      });
      console.log(`✅ Удалено ${otherBotMessages.length} других сообщений бота\n`);
    }

    // Создаем правильную последовательность системных сообщений
    console.log("📝 Создаем правильную последовательность сообщений...\n");

    // 1. Приветственное сообщение (уже есть или создаем)
    if (!welcomeMessage) {
      console.log("1️⃣  Создаем приветственное сообщение...");
      const defaultBot = await prisma.chatBot.findFirst({
        where: { isDefault: true },
      });

      await prisma.chatMessage.create({
        data: {
          userId: user.id,
          sessionId: statementSession.id,
          role: "assistant",
          content: `Здравствуйте! 👋 Я AI-помощник профсоюза МООП РЗ.

Я готов ответить на ваши вопросы о профсоюзе, скидках BestBenefits, правах членов профсоюза и многом другом.

Если вы ещё не член профсоюза - заполните анкету для подачи заявления о вступлении.

[SHOW_SELF_FILL_BUTTON]`,
          chatBotId: defaultBot?.id || null,
          isSystemMessage: false,
        },
      });
      console.log("   ✅ Создано\n");
    }

    // 2. Сообщение о заполнении анкеты (если профиль заполнен)
    const { isProfileComplete } = await import("../lib/profile-extraction");
    if (isProfileComplete(user)) {
      console.log("2️⃣  Создаем сообщение о заполнении анкеты...");
      await SystemMessages.profileCompleted(user.id);
      console.log("   ✅ Создано\n");
    }

    // 3. Сообщение о генерации документов (если документы есть)
    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
        status: "GENERATED",
      },
    });

    if (documents.length > 0) {
      console.log("3️⃣  Создаем сообщение о генерации документов...");
      const generatedDocs = documents.map((doc) => ({
        type: doc.type,
        title: doc.title || (doc.type === "MEMBERSHIP_APPLICATION" ? "Заявление о вступлении в профсоюз" : "Заявление о взносах"),
        filePath: doc.filePath || "",
      }));
      await SystemMessages.documentsGenerated(user.id, generatedDocs);
      console.log("   ✅ Создано\n");

      // 4. Инструкция по загрузке (если документы не подписаны)
      const hasSignedDocs = documents.some((doc) => doc.status === "SIGNED" || doc.status === "PENDING");
      if (!hasSignedDocs) {
        console.log("4️⃣  Создаем инструкцию по загрузке документов...");
        await SystemMessages.uploadDocumentsInstruction(user.id);
        console.log("   ✅ Создано\n");
      }
    }

    // Проверяем результат
    const finalMessages = await prisma.chatMessage.findMany({
      where: {
        sessionId: statementSession.id,
        userId: user.id,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log("📨 Финальная последовательность сообщений:");
    finalMessages.forEach((msg, idx) => {
      const preview = msg.content.substring(0, 80).replace(/\n/g, " ");
      const isSystem = msg.isSystemMessage ? "🔔 СИСТЕМНОЕ" : msg.role === "assistant" ? "🤖 БОТ" : "👤 ПОЛЬЗОВАТЕЛЬ";
      console.log(`   ${idx + 1}. [${isSystem}] ${msg.createdAt.toISOString()}: ${preview}...`);
    });

    console.log("\n✅ Готово! Чат настроен согласно сценарию.\n");
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

