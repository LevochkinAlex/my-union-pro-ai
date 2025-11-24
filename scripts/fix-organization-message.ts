/**
 * Скрипт для исправления сообщения AI об организации в конкретной сессии
 * 
 * ВАЖНО: Это изменяет историю чата и должно использоваться только в исключительных случаях!
 * Лучше настроить DaData API для будущих сессий.
 * 
 * Использование:
 * npx tsx scripts/fix-organization-message.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ID сессии, в которой нужно исправить сообщение
const SESSION_ID = "cmidgy3gy0004ptg7zn6v04np";

// Старый текст (неправильный)
const OLD_TEXT = "БСМП Гор больница Челны";

// Новый текст (правильный из ЕГРЮЛ)
const NEW_TEXT = "ГАУЗ «Больница скорой медицинской помощи города Набережные Челны»";

async function fixOrganizationMessage() {
  console.log("🔍 Поиск сообщения для исправления...\n");
  console.log(`   Сессия: ${SESSION_ID}`);
  console.log(`   Старый текст: "${OLD_TEXT}"`);
  console.log(`   Новый текст: "${NEW_TEXT}"\n`);

  try {
    // Находим сообщения AI в этой сессии, содержащие старый текст
    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId: SESSION_ID,
        role: "assistant",
        content: {
          contains: OLD_TEXT,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (messages.length === 0) {
      console.log("❌ Сообщение не найдено!");
      console.log("\nВозможные причины:");
      console.log("  1. Неправильный ID сессии");
      console.log("  2. Сообщение уже было изменено");
      console.log("  3. Текст не совпадает точно\n");
      return;
    }

    console.log(`✅ Найдено сообщений: ${messages.length}\n`);

    // Обрабатываем каждое найденное сообщение
    let updated = 0;
    for (const msg of messages) {
      console.log(`📝 Обработка сообщения ${msg.id}...`);
      console.log(`   Создано: ${msg.createdAt.toISOString()}`);
      
      // Заменяем старый текст на новый во всем содержимом
      const oldContent = msg.content;
      const newContent = oldContent.replace(
        new RegExp(OLD_TEXT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        NEW_TEXT
      );

      // Также обновляем текст, если там было просто название без контекста
      const updatedContent = newContent.replace(
        /Я нашел вашу организацию: ([^(]*)\. Это правильная организация\?/g,
        `Я нашел вашу организацию: **${NEW_TEXT}** (в реестре Минюста РФ). Это правильная организация?`
      );

      // Сохраняем изменения
      await prisma.chatMessage.update({
        where: { id: msg.id },
        data: { content: updatedContent },
      });

      console.log(`✅ Сообщение обновлено!\n`);
      console.log(`   Было: ${oldContent.substring(0, 100)}...`);
      console.log(`   Стало: ${updatedContent.substring(0, 100)}...\n`);
      updated++;
    }

    console.log("=".repeat(60));
    console.log(`🎉 Готово! Обновлено сообщений: ${updated}`);
    console.log("=".repeat(60));
    console.log("\n⚠️  ВАЖНО: Не забудьте настроить DaData API для будущих сессий!");
    console.log("   Смотрите: ENV_QUICKSTART.md → Шаг 3: DaData\n");

  } catch (error) {
    console.error("\n❌ Ошибка при обновлении сообщения:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем
fixOrganizationMessage()
  .then(() => {
    console.log("✅ Скрипт завершен успешно");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Ошибка выполнения скрипта:", error);
    process.exit(1);
  });

