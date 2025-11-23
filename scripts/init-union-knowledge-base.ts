#!/usr/bin/env tsx
/**
 * Инициализация базы знаний профсоюза:
 * 1. Создание/проверка базы знаний "База знаний профсоюза"
 * 2. Загрузка документов из public/docs/union
 * 3. Связывание с ботами "Мой чат" и "Appeal"
 * 4. Удаление тестовой базы "123"
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";

const prisma = new PrismaClient();

const UNION_DOCS_DIR = path.join(process.cwd(), "public", "docs", "union");
const KB_NAME = "База знаний профсоюза";
const KB_DESCRIPTION = "Устав, положения, регламенты и нормативные документы профсоюза работников здравоохранения РФ";

async function extractTextFromDocx(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

async function main() {
  console.log("🚀 Инициализация базы знаний профсоюза\n");

  // 1. Удаление тестовой базы "123"
  console.log("🗑️  Удаление тестовых баз знаний...");
  const testBases = await prisma.knowledgeBase.findMany({
    where: {
      OR: [
        { name: { contains: "123" } },
        { name: { contains: "test" } },
        { name: { contains: "Test" } },
      ],
    },
  });

  for (const kb of testBases) {
    console.log(`   Удаление: ${kb.name}`);
    await prisma.knowledgeBase.delete({ where: { id: kb.id } });
  }
  console.log("✅ Тестовые базы удалены\n");

  // 2. Создание/проверка базы знаний профсоюза
  let knowledgeBase = await prisma.knowledgeBase.findFirst({
    where: { name: KB_NAME },
  });

  if (knowledgeBase) {
    console.log(`📚 База знаний найдена: ${knowledgeBase.id}`);
    console.log(`🗑️  Очистка старых документов...`);
    await prisma.knowledgeChunk.deleteMany({
      where: { knowledgeBaseId: knowledgeBase.id },
    });
    await prisma.knowledgeDocument.deleteMany({
      where: { knowledgeBaseId: knowledgeBase.id },
    });
    await prisma.knowledgeSource.deleteMany({
      where: { knowledgeBaseId: knowledgeBase.id },
    });
    console.log("✅ Старые документы удалены\n");
  } else {
    console.log("📝 Создание новой базы знаний...");
    knowledgeBase = await prisma.knowledgeBase.create({
      data: {
        name: KB_NAME,
        description: KB_DESCRIPTION,
        isActive: true,
      },
    });
    console.log(`✅ База знаний создана: ${knowledgeBase.id}\n`);
  }

  // 3. Загрузка документов
  console.log("📂 Загрузка документов...\n");
  const files = fs.readdirSync(UNION_DOCS_DIR);
  let processedCount = 0;

  for (const file of files) {
    const filePath = path.join(UNION_DOCS_DIR, file);
    const stats = fs.statSync(filePath);

    if (!stats.isFile()) continue;

    const ext = path.extname(file).toLowerCase();

    // Пропускаем изображения
    if ([".jpg", ".jpeg", ".png", ".gif"].includes(ext)) {
      console.log(`⏭️  Пропуск изображения: ${file}`);
      continue;
    }

    // Пропускаем PDF (временно, так как требует библиотека)
    if (ext === ".pdf") {
      console.log(`⏭️  Пропуск PDF (требуется доработка): ${file}`);
      continue;
    }

    console.log(`📄 Обработка: ${file}`);

    try {
      // Извлекаем текст
      let text = "";
      if (ext === ".docx" || ext === ".doc") {
        text = await extractTextFromDocx(filePath);
      } else if (ext === ".txt" || ext === ".md") {
        text = fs.readFileSync(filePath, "utf-8").trim();
      } else {
        console.log(`   ⚠️  Неподдерживаемый формат: ${ext}`);
        continue;
      }

      if (!text || text.length < 100) {
        console.log(`   ⚠️  Текст слишком короткий или пустой`);
        continue;
      }

      // Создаем source
      const source = await prisma.knowledgeSource.create({
        data: {
          knowledgeBaseId: knowledgeBase.id,
          type: "MANUAL",
          title: file,
          metadata: {
            fileName: file,
            fileType: ext.slice(1),
            textLength: text.length,
            uploadedAt: new Date().toISOString(),
          },
          status: "COMPLETED",
          lastFetchedAt: new Date(),
        },
      });

      // Создаем документ
      const document = await prisma.knowledgeDocument.create({
        data: {
          knowledgeBaseId: knowledgeBase.id,
          sourceId: source.id,
          fileName: null,
          originalName: file,
          fileType: "text",
          fileSize: Buffer.byteLength(text, "utf8"),
          filePath: null,
          mimeType: "text/plain",
          contentType: "TEXT",
          processingStatus: "QUEUED",
          meta: {
            textContent: text,
            fileName: file,
          },
        },
      });

      // Разбиваем на chunks (простое разбиение по 1000 символов)
      const chunks = [];
      const chunkSize = 1000;
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
      }

      // Сохраняем chunks
      for (let i = 0; i < chunks.length; i++) {
        await prisma.knowledgeChunk.create({
          data: {
            knowledgeBaseId: knowledgeBase.id,
            content: chunks[i],
            metadata: {
              fileName: file,
              chunkIndex: i,
              totalChunks: chunks.length,
              documentId: document.id,
            } as any,
          },
        });
      }

      // Обновляем статус
      await prisma.knowledgeDocument.update({
        where: { id: document.id },
        data: {
          processingStatus: "COMPLETED",
          processedAt: new Date(),
          meta: {
            textContent: text,
            fileName: file,
            chunkCount: chunks.length,
            textLength: text.length,
          },
        },
      });

      processedCount++;
      console.log(`   ✅ Загружено (${chunks.length} фрагментов)\n`);
    } catch (error) {
      console.error(`   ❌ Ошибка: ${error instanceof Error ? error.message : "Unknown error"}\n`);
    }
  }

  console.log(`✅ Загружено документов: ${processedCount}\n`);

  // 4. Связывание с ботами
  console.log("🤖 Связывание с ботами...");

  // Находим ботов по имени
  const statementBot = await prisma.chatBot.findFirst({
    where: {
      OR: [
        { name: { contains: "Мой чат" } },
        { name: { contains: "Statement" } },
        { name: { contains: "Заявление" } },
      ],
    },
  });

  const appealBot = await prisma.chatBot.findFirst({
    where: {
      OR: [
        { name: { contains: "Appeal" } },
        { name: { contains: "Обращение" } },
      ],
    },
  });

  if (statementBot) {
    // Удаляем старые связи
    await prisma.chatBotKnowledgeBase.deleteMany({
      where: { chatBotId: statementBot.id },
    });

    // Создаем новую связь
    await prisma.chatBotKnowledgeBase.create({
      data: {
        chatBotId: statementBot.id,
        knowledgeBaseId: knowledgeBase.id,
      },
    });

    console.log(`✅ Бот "Мой чат" (${statementBot.name}) связан с базой знаний`);
  } else {
    console.warn("⚠️  Бот 'Мой чат' не найден");
  }

  if (appealBot) {
    // Удаляем старые связи
    await prisma.chatBotKnowledgeBase.deleteMany({
      where: { chatBotId: appealBot.id },
    });

    // Создаем новую связь
    await prisma.chatBotKnowledgeBase.create({
      data: {
        chatBotId: appealBot.id,
        knowledgeBaseId: knowledgeBase.id,
      },
    });

    console.log(`✅ Бот "Appeal" (${appealBot.name}) связан с базой знаний`);
  } else {
    console.warn("⚠️  Бот 'Appeal' не найден");
  }

  console.log("\n✅ Инициализация завершена!");
  console.log(`\n📊 Статистика:`);
  console.log(`   База знаний ID: ${knowledgeBase.id}`);
  console.log(`   Документов загружено: ${processedCount}`);
  console.log(`   Связано ботов: ${[statementBot, appealBot].filter(Boolean).length}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Ошибка:", error);
  process.exit(1);
});

