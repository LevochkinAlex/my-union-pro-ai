/**
 * Скрипт для обработки документов Appeal Bot
 * Обрабатывает все документы в статусе QUEUED для базы знаний Appeal Bot
 */

import { prisma } from "../lib/prisma";
import { processKnowledgeDocument } from "../lib/knowledge/processor";

const KB_NAME = "Appeal Bot Knowledge Base";

async function processDocuments() {
  try {
    console.log("🔍 Поиск базы знаний Appeal Bot...\n");

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
      where: { name: { contains: "Appeal" } },
    });

    if (!knowledgeBase) {
      console.error("❌ База знаний Appeal Bot не найдена!");
      process.exit(1);
    }

    console.log(`✅ Найдена база знаний: ${knowledgeBase.name} (ID: ${knowledgeBase.id})\n`);

    // Находим все документы в статусе QUEUED
    const queuedDocs = await prisma.knowledgeDocument.findMany({
      where: {
        knowledgeBaseId: knowledgeBase.id,
        processingStatus: "QUEUED",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (queuedDocs.length === 0) {
      console.log("✅ Нет документов для обработки (все уже обработаны)\n");
      process.exit(0);
    }

    console.log(`📄 Найдено документов для обработки: ${queuedDocs.length}\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const doc of queuedDocs) {
      try {
        console.log(`🔄 Обработка: ${doc.originalName || doc.fileName}...`);
        
        await processKnowledgeDocument(doc.id);
        
        // Проверяем результат
        const updated = await prisma.knowledgeDocument.findUnique({
          where: { id: doc.id },
          include: {
            chunks: true,
          },
        });

        if (updated?.processingStatus === "COMPLETED") {
          console.log(`   ✅ Успешно обработан (чанков: ${updated.chunks.length})\n`);
          successCount++;
        } else {
          console.log(`   ⚠️  Статус: ${updated?.processingStatus}\n`);
          errorCount++;
        }
      } catch (error) {
        console.error(`   ❌ Ошибка: ${error instanceof Error ? error.message : String(error)}\n`);
        errorCount++;
      }
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("📊 ИТОГИ:");
    console.log(`   ✅ Успешно обработано: ${successCount}`);
    console.log(`   ❌ Ошибок: ${errorCount}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    // Показываем финальную статистику
    const finalStats = await prisma.knowledgeDocument.groupBy({
      by: ["processingStatus"],
      where: {
        knowledgeBaseId: knowledgeBase.id,
      },
      _count: true,
    });

    console.log("📈 Статус документов в базе знаний:");
    finalStats.forEach((stat) => {
      console.log(`   ${stat.processingStatus}: ${stat._count}`);
    });

    const totalChunks = await prisma.knowledgeChunk.count({
      where: {
        knowledgeBaseId: knowledgeBase.id,
      },
    });

    console.log(`\n📚 Всего чанков в базе знаний: ${totalChunks}\n`);
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

processDocuments();

