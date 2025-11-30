import { prisma } from "../lib/prisma";
import { isProfileComplete } from "../lib/profile-extraction";

const sessionId = process.argv[2];

if (!sessionId) {
  console.error("❌ Укажите ID сессии: pnpm tsx scripts/fix-session-messages-v3.ts cmij7dj480005ptrczuatcd73");
  process.exit(1);
}

async function fixSessionMessages() {
  try {
    console.log(`\n🔍 Проверяем сессию: ${sessionId}\n`);

    // Находим сессию
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!session) {
      console.log("❌ Сессия не найдена!");
      process.exit(1);
    }

    console.log(`✅ Сессия найдена: ${session.title} (${session.type})`);
    console.log(`   Пользователь: ${session.user.firstName} ${session.user.lastName} (${session.user.email})\n`);

    // Получаем все сообщения сессии
    const allMessages = await prisma.chatMessage.findMany({
      where: {
        sessionId: session.id,
        userId: session.userId,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`📋 Всего сообщений в сессии: ${allMessages.length}\n`);

    // Удаляем ВСЕ старые сообщения в этой сессии
    if (allMessages.length > 0) {
      console.log("🗑️  Удаляем все старые сообщения в сессии...");
      const deleted = await prisma.chatMessage.deleteMany({
        where: {
          sessionId: session.id,
          userId: session.userId,
        },
      });
      console.log(`✅ Удалено ${deleted.count} сообщений\n`);
    }

    // Проверяем статус профиля и документов
    const profileComplete = isProfileComplete(session.user);
    const documents = await prisma.document.findMany({
      where: {
        userId: session.userId,
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
      },
      orderBy: { createdAt: "desc" },
    });

    const hasGeneratedDocs = documents.some((doc) => doc.status === "GENERATED" || doc.filePath);
    const hasSignedDocs = documents.some((doc) => doc.status === "SIGNED" || doc.status === "PENDING" || doc.status === "APPROVED");

    console.log("📊 Статус пользователя:");
    console.log(`   Профиль заполнен: ${profileComplete ? "✅ ДА" : "❌ НЕТ"}`);
    console.log(`   Документы сгенерированы: ${hasGeneratedDocs ? "✅ ДА" : "❌ НЕТ"}`);
    console.log(`   Документы загружены: ${hasSignedDocs ? "✅ ДА" : "❌ НЕТ"}\n`);

    // Создаем правильную последовательность согласно сценарию
    console.log("📝 Создаем правильную последовательность сообщений...\n");

    const defaultBot = await prisma.chatBot.findFirst({
      where: { isDefault: true },
    });

    // 1. Приветственное сообщение
    console.log("1️⃣  Создаем приветственное сообщение...");
    await prisma.chatMessage.create({
      data: {
        userId: session.userId,
        sessionId: session.id,
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

    // 2. Если профиль заполнен - сообщение о заполнении анкеты
    if (profileComplete) {
      console.log("2️⃣  Создаем сообщение о заполнении анкеты...");
      await prisma.chatMessage.create({
        data: {
          userId: session.userId,
          sessionId: session.id,
          role: "assistant",
          content: `✅ Вы успешно заполнили свою анкету!\n\nТеперь вы можете сгенерировать документы для вступления в профсоюз.\n\n[GENERATE_DOCUMENTS_BUTTON]`,
          isSystemMessage: true,
        },
      });
      console.log("   ✅ Создано\n");

      // 3. Если документы сгенерированы - сообщение о генерации
      if (hasGeneratedDocs) {
        console.log("3️⃣  Создаем сообщение о генерации документов...");
        const generatedDocs = documents
          .filter((doc) => doc.status === "GENERATED" || (doc.filePath && !doc.signedFilePath))
          .map((doc) => doc.title || (doc.type === "MEMBERSHIP_APPLICATION" ? "Заявление о вступлении в профсоюз" : "Заявление о взносах"));
        
        const docsList = generatedDocs.map((title) => `• ${title}`).join("\n");
        
        await prisma.chatMessage.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            role: "assistant",
            content: `📄 Готово, ваши документы сгенерированы:\n\n${docsList}\n\nВы можете скачать их, распечатать, подписать и загрузить обратно.`,
            isSystemMessage: true,
          },
        });
        console.log("   ✅ Создано\n");

        // 4. Инструкция по загрузке (если документы не подписаны)
        if (!hasSignedDocs) {
          console.log("4️⃣  Создаем инструкцию по загрузке документов...");
          await prisma.chatMessage.create({
            data: {
              userId: session.userId,
              sessionId: session.id,
              role: "assistant",
              content: `📎 Вы можете прикрепить подписанные документы прямо в чат (используйте кнопку прикрепления файла) или воспользоваться разделом "Документы" в меню.`,
              isSystemMessage: true,
            },
          });
          console.log("   ✅ Создано\n");
        }
      }

      // 5. Если документы загружены - сообщение о том, что они отправлены на проверку
      if (hasSignedDocs) {
        console.log("5️⃣  Создаем сообщение о том, что документы отправлены на проверку...");
        await prisma.chatMessage.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            role: "assistant",
            content: `✅ Спасибо за ваши документы!\n\nОни направлены руководителю на проверку. Ожидайте, пожалуйста, валидацию.\n\nКак только вы будете приняты в члены профсоюза, для вас откроются все привилегии:\n\n✨ **Доступ к скидкам BestBenefits** - эксклюзивные предложения от партнеров профсоюза\n📚 **Юридическая поддержка** - консультации по трудовому праву\n🎁 **Социальные программы** - помощь в сложных жизненных ситуациях\n📢 **Участие в жизни профсоюза** - голосование, собрания, инициативы\n🏥 **Медицинская поддержка** - программы оздоровления и профилактики\n🎓 **Образовательные программы** - курсы повышения квалификации\n\nПосле одобрения вы сможете общаться с AI-помощником и задавать любые вопросы!`,
            isSystemMessage: true,
          },
        });
        console.log("   ✅ Создано\n");
      }
    }

    // Проверяем результат
    const finalMessages = await prisma.chatMessage.findMany({
      where: {
        sessionId: session.id,
        userId: session.userId,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log("📨 Финальная последовательность сообщений:");
    finalMessages.forEach((msg, idx) => {
      const preview = msg.content.substring(0, 80).replace(/\n/g, " ");
      const isSystem = msg.isSystemMessage ? "🔔 СИСТЕМНОЕ" : msg.role === "assistant" ? "🤖 БОТ" : "👤 ПОЛЬЗОВАТЕЛЬ";
      const markers = [];
      if (msg.content.includes("[SHOW_SELF_FILL_BUTTON]")) markers.push("SHOW_SELF_FILL_BUTTON");
      if (msg.content.includes("[GENERATE_DOCUMENTS_BUTTON]")) markers.push("GENERATE_DOCUMENTS_BUTTON");
      console.log(`   ${idx + 1}. [${isSystem}] ${msg.createdAt.toISOString()}: ${preview}...${markers.length > 0 ? ` [${markers.join(", ")}]` : ""}`);
    });

    console.log("\n✅ Готово! Сессия настроена согласно сценарию.\n");
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

fixSessionMessages();

