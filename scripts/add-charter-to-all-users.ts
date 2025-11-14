/**
 * Скрипт для добавления устава всем существующим пользователям
 * Запуск: pnpm tsx scripts/add-charter-to-all-users.ts
 */

import { prisma } from "../lib/prisma";

const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
const CHARTER_TITLE = "Устав Профсоюза работников здравоохранения РФ";
const CHARTER_DESCRIPTION = "Устав Профсоюза работников здравоохранения РФ (принят на VII съезде, апрель 2021)";
const CHARTER_FILENAME = "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";

async function addCharterToAllUsers() {
  try {
    console.log("Начинаем добавление устава всем пользователям...");

    // Получаем всех пользователей
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
      },
    });

    console.log(`Найдено пользователей: ${users.length}`);

    let addedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        // Проверяем, есть ли уже устав у пользователя
        const existingCharter = await prisma.document.findFirst({
          where: {
            userId: user.id,
            type: "OTHER",
            title: {
              contains: "Устав",
            },
          },
        });

        if (existingCharter) {
          console.log(`У пользователя ${user.email} уже есть устав, пропускаем`);
          skippedCount++;
          continue;
        }

        // Добавляем устав
        await prisma.document.create({
          data: {
            userId: user.id,
            type: "OTHER",
            status: "GENERATED",
            title: CHARTER_TITLE,
            description: CHARTER_DESCRIPTION,
            filePath: CHARTER_PATH,
            fileName: CHARTER_FILENAME,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        });

        console.log(`✅ Устав добавлен пользователю ${user.email}`);
        addedCount++;
      } catch (error) {
        console.error(`❌ Ошибка при добавлении устава пользователю ${user.email}:`, error);
        errorCount++;
      }
    }

    console.log("\n=== Результаты ===");
    console.log(`Добавлено: ${addedCount}`);
    console.log(`Пропущено (уже есть): ${skippedCount}`);
    console.log(`Ошибок: ${errorCount}`);
    console.log(`Всего обработано: ${users.length}`);
  } catch (error) {
    console.error("Критическая ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addCharterToAllUsers();

