#!/usr/bin/env tsx

/**
 * Скрипт для очистки документов несуществующих пользователей
 * Удаляет документы, у которых userId не существует в таблице User
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function cleanupOrphanedDocuments() {
  console.log("🔍 Поиск документов несуществующих пользователей...\n");

  try {
    // Получаем все документы
    const allDocuments = await prisma.document.findMany({
      select: {
        id: true,
        userId: true,
        fileName: true,
        filePath: true,
        signedFilePath: true,
        type: true,
        title: true,
      },
    });

    console.log(`📄 Всего документов в базе: ${allDocuments.length}`);

    // Получаем все существующие ID пользователей
    const existingUserIds = new Set(
      (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id)
    );

    console.log(`👥 Всего пользователей в базе: ${existingUserIds.size}\n`);

    // Находим документы с несуществующими пользователями
    const orphanedDocuments = allDocuments.filter(
      (doc) => !existingUserIds.has(doc.userId)
    );

    if (orphanedDocuments.length === 0) {
      console.log("✅ Нет документов с несуществующими пользователями");
      return;
    }

    console.log(`⚠️  Найдено документов с несуществующими пользователями: ${orphanedDocuments.length}\n`);

    let deletedCount = 0;
    let fileDeletedCount = 0;
    let fileErrorCount = 0;

    for (const doc of orphanedDocuments) {
      try {
        console.log(`🗑️  Удаление документа: ${doc.title} (ID: ${doc.id}, UserID: ${doc.userId})`);

        // Удаляем файлы, если они существуют
        if (doc.filePath) {
          try {
            const filePath = path.join(process.cwd(), "public", doc.filePath);
            await fs.unlink(filePath).catch(() => {
              // Игнорируем ошибки, если файл не существует
            });
            fileDeletedCount++;
          } catch (error) {
            console.warn(`   ⚠️  Не удалось удалить файл ${doc.filePath}`);
            fileErrorCount++;
          }
        }

        if (doc.signedFilePath) {
          try {
            const signedFilePath = path.join(process.cwd(), "public", doc.signedFilePath);
            await fs.unlink(signedFilePath).catch(() => {
              // Игнорируем ошибки, если файл не существует
            });
            fileDeletedCount++;
          } catch (error) {
            console.warn(`   ⚠️  Не удалось удалить подписанный файл ${doc.signedFilePath}`);
            fileErrorCount++;
          }
        }

        // Удаляем запись из базы данных
        await prisma.document.delete({
          where: { id: doc.id },
        });

        deletedCount++;
        console.log(`   ✅ Удален`);
      } catch (error) {
        console.error(`   ❌ Ошибка при удалении документа ${doc.id}:`, error);
      }
    }

    console.log("\n" + "═".repeat(60));
    console.log("📊 ИТОГИ ОЧИСТКИ:");
    console.log(`   ✅ Удалено документов из БД: ${deletedCount}`);
    console.log(`   📁 Удалено файлов: ${fileDeletedCount}`);
    if (fileErrorCount > 0) {
      console.log(`   ⚠️  Ошибок при удалении файлов: ${fileErrorCount}`);
    }
    console.log("═".repeat(60) + "\n");
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    throw error;
  }
}

cleanupOrphanedDocuments()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

