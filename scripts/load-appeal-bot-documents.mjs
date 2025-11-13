#!/usr/bin/env node

/**
 * Script to load documents from /public/docs/union into Appeal Bot Knowledge Base
 * Usage: node scripts/load-appeal-bot-documents.mjs
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// Import Prisma
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const DOCS_DIR = path.join(projectRoot, "public", "docs", "union");
const BOT_NAME = "Appeal Bot";
const KB_NAME = "Appeal Bot Knowledge Base";

// MIME type mapping
const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".pages": "application/x-iwork-pages-sffpages",
};

async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

async function loadDocuments() {
  try {
    console.log("🔍 Scanning documents directory:", DOCS_DIR);

    const files = await fs.readdir(DOCS_DIR);
    const docFiles = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        // Skip hidden files and system files
        if (file.startsWith(".")) return false;
        // Include documents we can process
        return [
          ".pdf",
          ".docx",
          ".doc",
          ".jpg",
          ".jpeg",
          ".png",
          ".xls",
          ".xlsx",
          ".txt",
          ".pages",
        ].includes(ext);
      })
      .sort();

    console.log(`📄 Found ${docFiles.length} documents to process\n`);

    if (docFiles.length === 0) {
      console.log("⚠️  No documents found");
      process.exit(0);
    }

    // Check if Appeal Bot exists
    let chatBot = await prisma.chatBot.findFirst({
      where: { name: BOT_NAME },
    });

    if (!chatBot) {
      console.log(`✨ Creating ${BOT_NAME}...`);
      chatBot = await prisma.chatBot.create({
        data: {
          name: BOT_NAME,
          description: "Bot for handling user appeals and requests (legal, accounting, technical, etc.)",
          systemPrompt: `Вы - профессиональный помощник по обращениям и запросам в профсоюз. Вы помогаете пользователям с:

📋 ОСНОВНЫЕ ФУНКЦИИ:
- Юридические консультации и помощь
- Вопросы, связанные с членством и взносами
- Информация о правах и обязанностях членов профсоюза
- Процедурные и административные вопросы
- Ответы на основе документов профсоюза

🎯 ВАША РОЛЬ:
1. Внимательно слушайте и понимайте суть обращения пользователя
2. Предоставляйте точную информацию на основе документов профсоюза
3. Направляйте пользователей через нужные процедуры
4. Объясняйте права и обязанности членов
5. Предлагайте логические шаги для решения проблемы

✅ ПРАВИЛА:
- Будьте вежливы, профессиональны и внимательны
- Ссылайтесь на конкретные документы, когда это необходимо
- Если нужна информация вне Вашей базы знаний, скажите пользователю
- Объясняйте сложные положения простым языком
- Предложите альтернативные решения, если существуют
- Всегда подтверждайте понимание проблемы перед ответом

❌ ИЗБЕГАЙТЕ:
- Давайте юридические консультации, которые требуют адвоката
- Обещайте результаты без уверенности
- Игнорируйте нюансы в вопросах
- Переусложняйте ответы

💡 ТОН: Профессиональный, сочувственный, готовый помочь

Используйте доступные документы профсоюза для предоставления точной информации.`,
          isActive: true,
        },
      });
      console.log(`✅ Created ${BOT_NAME}\n`);
    }

    // Check if Knowledge Base exists
    let knowledgeBase = await prisma.knowledgeBase.findFirst({
      where: { name: KB_NAME },
    });

    if (!knowledgeBase) {
      console.log(`✨ Creating ${KB_NAME}...`);
      knowledgeBase = await prisma.knowledgeBase.create({
        data: {
          name: KB_NAME,
          description: "Knowledge base for Appeal Bot with union documents and guidelines",
          isActive: true,
        },
      });
      
      // Link Knowledge Base to ChatBot
      await prisma.chatBotKnowledgeBase.create({
        data: {
          chatBotId: chatBot.id,
          knowledgeBaseId: knowledgeBase.id,
        },
      });
      console.log(`✅ Created ${KB_NAME}\n`);
    } else {
      console.log(`✅ Using existing ${KB_NAME}\n`);
      
      // Ensure link exists
      const existingLink = await prisma.chatBotKnowledgeBase.findFirst({
        where: {
          chatBotId: chatBot.id,
          knowledgeBaseId: knowledgeBase.id,
        },
      });
      
      if (!existingLink) {
        await prisma.chatBotKnowledgeBase.create({
          data: {
            chatBotId: chatBot.id,
            knowledgeBaseId: knowledgeBase.id,
          },
        });
      }
    }

    // Load documents
    console.log("📂 Loading documents into Knowledge Base...\n");

    let successCount = 0;
    let errorCount = 0;

    for (const file of docFiles) {
      const filePath = path.join(DOCS_DIR, file);
      const relativePath = path.join("docs", "union", file);
      const ext = path.extname(file).toLowerCase();
      const mimeType = MIME_TYPES[ext] || "application/octet-stream";
      const fileSize = await getFileSize(filePath);

      try {
        // Check if document already exists
        const existingDoc = await prisma.knowledgeDocument.findFirst({
          where: {
            knowledgeBaseId: knowledgeBase.id,
            fileName: file,
          },
        });

        if (existingDoc) {
          console.log(`⏭️  ${file} (already exists, skipping)`);
          continue;
        }

        const document = await prisma.knowledgeDocument.create({
          data: {
            knowledgeBaseId: knowledgeBase.id,
            fileName: file,
            originalName: file,
            filePath: `/${relativePath}`,
            fileType: ext.replace(".", "").toUpperCase(),
            mimeType,
            fileSize,
            processingStatus: "QUEUED",
          },
        });

        console.log(`✅ ${file} (${(fileSize / 1024).toFixed(1)}KB)`);
        successCount++;
      } catch (error) {
        console.error(`❌ ${file} - Error:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Successfully loaded: ${successCount} documents`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`\n🤖 Appeal Bot is ready for use!`);
    console.log(`   Bot: ${chatBot.id}`);
    console.log(`   Knowledge Base: ${knowledgeBase.id}`);
    console.log(`\nNote: Documents will be processed asynchronously.`);
    console.log(`Check the processing status in the admin panel.\n`);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
loadDocuments().catch(console.error);

