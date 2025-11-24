/**
 * Скрипт для обновления размера файла устава для всех существующих документов
 * Запуск: pnpm tsx scripts/update-charter-file-size.ts
 */

import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";

async function updateCharterFileSize() {
  try {
    console.log("🔍 Ищем документы устава без размера файла...\n");

    // Вычисляем размер файла устава
    let fileSize: number | null = null;
    try {
      const fullPath = path.join(process.cwd(), "public", CHARTER_PATH);
      const stats = fs.statSync(fullPath);
      fileSize = stats.size;
      console.log(`📊 Размер файла устава: ${fileSize} байт (${(fileSize / 1024).toFixed(1)} КБ)\n`);
    } catch (fsError) {
      console.error("❌ Не удалось получить размер файла устава:", fsError);
      process.exit(1);
    }

    // Получаем все документы устава без размера файла
    const charterDocuments = await prisma.document.findMany({
      where: {
        type: "OTHER",
        title: {
          contains: "Устав",
        },
        fileSize: null,
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    console.log(`Найдено документов устава без размера: ${charterDocuments.length}\n`);

    if (charterDocuments.length === 0) {
      console.log("✅ Все документы устава уже имеют размер файла");
      return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    for (const doc of charterDocuments) {
      try {
        await prisma.document.update({
          where: { id: doc.id },
          data: { fileSize: fileSize },
        });

        console.log(`✅ Обновлен документ для пользователя ${doc.user?.email || 'N/A'} (ID: ${doc.id})`);
        updatedCount++;
      } catch (error) {
        console.error(`❌ Ошибка при обновлении документа ${doc.id}:`, error);
        errorCount++;
      }
    }

    console.log("\n=== Результаты ===");
    console.log(`Обновлено: ${updatedCount}`);
    console.log(`Ошибок: ${errorCount}`);
    console.log(`Всего обработано: ${charterDocuments.length}`);
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateCharterFileSize();

