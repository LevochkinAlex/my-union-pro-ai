/**
 * Скрипт для сброса полей профиля пользователя
 * Запуск: pnpm tsx scripts/reset-profile-fields.ts <email>
 */

import { prisma } from "../lib/prisma";

async function resetProfileFields(email: string) {
  try {
    console.log(`\n🔍 Поиск пользователя: ${email}\n`);

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`❌ Пользователь не найден`);
      return;
    }

    console.log(`✅ Пользователь найден: ${user.firstName || "N/A"} ${user.lastName || "N/A"}\n`);

    // Сбрасываем основные поля профиля
    await prisma.user.update({
      where: { id: user.id },
      data: {
        jobTitle: null,
        profession: null,
        education: null,
        membershipStatus: "PROFILE_INCOMPLETE",
      },
    });

    console.log(`✅ Сброшены поля: jobTitle, profession, education\n`);

    // Удаляем маркер [PROFILE_COMPLETE] из сообщений чата
    const messagesWithMarker = await prisma.chatMessage.findMany({
      where: {
        userId: user.id,
        content: {
          contains: "[PROFILE_COMPLETE]",
        },
      },
    });

    if (messagesWithMarker.length > 0) {
      for (const msg of messagesWithMarker) {
        // Убираем маркер из текста сообщения
        const updatedContent = msg.content.replace(/\n*\[PROFILE_COMPLETE\]\n*/g, "");
        
        if (updatedContent.trim() === "") {
          // Если после удаления маркера осталась пустая строка, удаляем сообщение
          await prisma.chatMessage.delete({
            where: { id: msg.id },
          });
          console.log(`🗑️ Удалено пустое сообщение с маркером`);
        } else {
          // Иначе обновляем сообщение без маркера
          await prisma.chatMessage.update({
            where: { id: msg.id },
            data: { content: updatedContent },
          });
          console.log(`✏️ Удален маркер из сообщения`);
        }
      }
    } else {
      console.log(`ℹ️ Маркеров [PROFILE_COMPLETE] не найдено`);
    }

    // Удаляем сгенерированные документы
    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
      },
    });

    if (documents.length > 0) {
      await prisma.document.deleteMany({
        where: {
          userId: user.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
        },
      });
      console.log(`\n🗑️ Удалено документов: ${documents.length}`);
    } else {
      console.log(`\nℹ️ Сгенерированных документов не найдено`);
    }

    console.log(`\n✅ Профиль пользователя ${email} сброшен!`);
    console.log(`\n💡 Теперь пользователь может заново ответить на вопросы о должности, профессии и образовании\n`);

  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error("❌ Использование: pnpm tsx scripts/reset-profile-fields.ts <email>");
  process.exit(1);
}

resetProfileFields(email);

