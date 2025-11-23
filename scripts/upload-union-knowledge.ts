#!/usr/bin/env tsx
/**
 * Загружает документы профсоюза в базу знаний для чат-бота
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const prisma = new PrismaClient();

const UNION_DOCS_DIR = path.join(process.cwd(), "public", "docs", "union");
const KNOWLEDGE_BASE_NAME = "База знаний профсоюза";
const KNOWLEDGE_BASE_DESCRIPTION = "Устав, положения, регламенты и документы профсоюза";

async function extractTextFromDocx(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractTextFromDoc(filePath: string): Promise<string> {
  // .doc файлы пытаемся прочитать как .docx
  return extractTextFromDocx(filePath);
}

async function extractTextFromPdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractText(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    if (ext === ".docx" || ext === ".doc") {
      return await extractTextFromDocx(filePath);
    } else if (ext === ".pdf") {
      return await extractTextFromPdf(filePath);
    } else if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") {
      console.log(`⏭️  Пропуск изображения: ${path.basename(filePath)}`);
      return null;
    } else {
      console.log(`⚠️  Неподдерживаемый формат: ${ext} (${path.basename(filePath)})`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Ошибка извлечения текста из ${path.basename(filePath)}:`, error);
    return null;
  }
}

// Разбивает текст на chunks по ~1000 символов
function splitIntoChunks(text: string, maxChunkSize = 1000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = "";
  
  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

async function main() {
  console.log("🚀 Загрузка документов профсоюза в базу знаний\n");

  // 1. Находим или создаем базу знаний
  let knowledgeBase = await prisma.knowledgeBase.findFirst({
    where: { name: KNOWLEDGE_BASE_NAME },
  });

  if (!knowledgeBase) {
    console.log("📝 Создание новой базы знаний...");
    knowledgeBase = await prisma.knowledgeBase.create({
      data: {
        name: KNOWLEDGE_BASE_NAME,
        description: KNOWLEDGE_BASE_DESCRIPTION,
      },
    });
    console.log(`✅ База знаний создана: ${knowledgeBase.id}\n`);
  } else {
    console.log(`✅ База знаний найдена: ${knowledgeBase.id}`);
    console.log(`🗑️  Удаление старых chunks...`);
    await prisma.knowledgeChunk.deleteMany({
      where: { knowledgeBaseId: knowledgeBase.id },
    });
    console.log("✅ Старые chunks удалены\n");
  }

  // 2. Читаем все файлы из папки
  const files = fs.readdirSync(UNION_DOCS_DIR);
  console.log(`📂 Найдено файлов: ${files.length}\n`);

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(UNION_DOCS_DIR, file);
    const stats = fs.statSync(filePath);
    
    if (!stats.isFile()) continue;

    console.log(`📄 Обработка: ${file}`);
    
    const text = await extractText(filePath);
    if (!text) {
      console.log(`   Пропущен\n`);
      continue;
    }

    // Разбиваем на chunks
    const chunks = splitIntoChunks(text, 1000);
    console.log(`   Извлечено ${text.length} символов`);
    console.log(`   Создано ${chunks.length} chunks`);

    // Сохраняем chunks в БД
    for (let i = 0; i < chunks.length; i++) {
      await prisma.knowledgeChunk.create({
        data: {
          knowledgeBaseId: knowledgeBase.id,
          content: chunks[i],
          metadata: {
            fileName: file,
            chunkIndex: i,
            totalChunks: chunks.length,
          } as any,
        },
      });
    }

    totalChunks += chunks.length;
    console.log(`   ✅ Загружено\n`);
  }

  console.log(`\n✅ Загрузка завершена!`);
  console.log(`📊 Всего chunks: ${totalChunks}`);
  console.log(`📦 База знаний: ${knowledgeBase.id}`);
  console.log(`\n🔗 Теперь свяжите базу знаний с ботом "Мой чат" в админке`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Ошибка:", error);
  process.exit(1);
});

