#!/usr/bin/env node

/**
 * Скрипт для добавления устава в базы знаний Appeal Bot и основного чат-бота
 * Usage: pnpm tsx scripts/add-charter-to-knowledge-bases.ts
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
const CHARTER_FILENAME = "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
const CHARTER_ORIGINAL_NAME = "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";

const MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function addCharterToKnowledgeBases() {
  try {
    console.log("🔍 Поиск баз знаний...\n");

    // 1. Найти базу знаний Appeal Bot
    const appealKB = await prisma.knowledgeBase.findFirst({
      where: { name: { contains: "Appeal Bot" } },
    });

    if (!appealKB) {
      console.error("❌ База знаний Appeal Bot не найдена!");
      console.log("💡 Создайте её с помощью: node scripts/load-appeal-bot-documents.mjs\n");
    } else {
      console.log(`✅ Найдена база знаний Appeal Bot: ${appealKB.name} (ID: ${appealKB.id})`);
    }

    // 2. Найти активного бота (для основного чата)
    const activeBot = await prisma.chatBot.findFirst({
      where: { isActive: true },
      include: {
        knowledgeBases: {
          include: {
            knowledgeBase: true,
          },
        },
      },
    });

    let mainKB = null;
    if (activeBot && activeBot.knowledgeBases.length > 0) {
      mainKB = activeBot.knowledgeBases[0].knowledgeBase;
      console.log(`✅ Найдена база знаний основного чат-бота: ${mainKB.name} (ID: ${mainKB.id})`);
    } else {
      console.warn("⚠️  Активный чат-бот не найден или не имеет базы знаний");
    }

    console.log("");

    // 3. Проверить существование файла
    const fullPath = path.join(process.cwd(), "public", CHARTER_PATH);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Файл устава не найден: ${fullPath}`);
      console.log("💡 Убедитесь, что файл находится в public/docs/union/\n");
      process.exit(1);
    }

    const stats = fs.statSync(fullPath);
    const fileSize = stats.size;
    console.log(`📄 Файл устава найден: ${(fileSize / 1024).toFixed(1)} КБ\n`);

    // 4. Добавить устав в базу знаний Appeal Bot
    if (appealKB) {
      await addCharterToKB(appealKB.id, "Appeal Bot");
    }

    // 5. Добавить устав в базу знаний основного чат-бота (если она отличается)
    if (mainKB && mainKB.id !== appealKB?.id) {
      await addCharterToKB(mainKB.id, "Основной чат-бот");
    } else if (mainKB && mainKB.id === appealKB?.id) {
      console.log("ℹ️  Основной чат-бот использует ту же базу знаний, что и Appeal Bot\n");
    }

    console.log("✅ Готово!\n");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function addCharterToKB(knowledgeBaseId: string, kbName: string) {
  try {
    console.log(`📚 Добавление устава в базу знаний: ${kbName}...`);

    // Проверить, есть ли уже устав в этой базе знаний
    const existingDoc = await prisma.knowledgeDocument.findFirst({
      where: {
        knowledgeBaseId,
        OR: [
          { fileName: CHARTER_FILENAME },
          { originalName: { contains: "Устав" } },
        ],
      },
    });

    if (existingDoc) {
      console.log(`   ⏭️  Устав уже существует (ID: ${existingDoc.id}), пропускаем\n`);
      return;
    }

    // Получить размер файла
    const fullPath = path.join(process.cwd(), "public", CHARTER_PATH);
    const stats = fs.statSync(fullPath);
    const fileSize = stats.size;

    // Создать запись документа
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        fileName: CHARTER_FILENAME,
        originalName: CHARTER_ORIGINAL_NAME,
        filePath: CHARTER_PATH,
        fileType: "DOCX",
        mimeType: MIME_TYPE,
        fileSize,
        processingStatus: "QUEUED",
      },
    });

    console.log(`   ✅ Устав добавлен (ID: ${document.id})`);
    console.log(`   📋 Статус: QUEUED (будет обработан асинхронно)\n`);

    // Попытаться добавить в очередь обработки (если Bull доступен)
    try {
      const { default: Bull } = await import("bull");
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      const queue = new Bull("document-processing", redisUrl);
      
      await queue.add(
        { documentId: document.id, knowledgeBaseId },
        {
          priority: 5,
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        }
      );
      
      await queue.close();
      console.log(`   🔄 Документ добавлен в очередь обработки\n`);
    } catch (queueError) {
      console.log(`   ⚠️  Не удалось добавить в очередь (Bull не доступен или Redis не запущен)`);
      console.log(`   💡 Обработайте документ вручную через админку или запустите:`);
      console.log(`      pnpm tsx scripts/process-appeal-bot-documents.ts\n`);
    }
  } catch (error: any) {
    console.error(`   ❌ Ошибка при добавлении устава: ${error.message}\n`);
    throw error;
  }
}

// Запуск скрипта
addCharterToKnowledgeBases().catch(console.error);

