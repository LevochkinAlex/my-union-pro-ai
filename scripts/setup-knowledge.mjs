import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";
import { Queue } from "bullmq";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();
const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "knowledge");

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});
}

const KNOWLEDGE_BASE_NAME = "Шаблоны заявлений МООП РЗ";

const documents = [
  {
    originalName: "Заявление о вступлении.doc",
    sourcePath: join(process.cwd(), "public", "docs", "Заявление о вступлении.doc"),
    description:
      "Текст заявления о вступлении в профсоюз. Содержит обращение к МООП РЗ и председателю ППО, основную формулировку просьбы о вступлении и подтверждение ознакомления с уставом.",
  },
  {
    originalName: "Заявление_об_взносах_пишется_с_первым.doc",
    sourcePath: join(process.cwd(), "public", "docs", "Заявление_об_взносах_пишется_с_первым.doc"),
    description:
      "Текст заявления об удержании членских взносов из заработной платы. Содержит просьбу удерживать 1% и перечислять на счет профсоюза.",
  },
];

async function copyToUploads(sourcePath, originalName) {
  await ensureUploadDir();
  const extension = originalName.split(".").pop() || "doc";
  const targetName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
  const targetPath = join(UPLOAD_DIR, targetName);
  await fs.copyFile(sourcePath, targetPath);
  const stats = await fs.stat(targetPath);
  return {
    fileName: targetName,
    filePath: `/uploads/knowledge/${targetName}`,
    fileSize: stats.size,
    fileType: extension.toLowerCase(),
  };
}

async function main() {
  try {
    await ensureUploadDir();

    const knowledgeBase = await prisma.knowledgeBase.findFirst({
      where: { name: KNOWLEDGE_BASE_NAME },
    });

    const kbRecord = knowledgeBase
      ? await prisma.knowledgeBase.update({
          where: { id: knowledgeBase.id },
          data: {
            description:
              "Шаблоны ключевых заявлений для вступления в профсоюз МООП РЗ и оформления членских взносов.",
            isActive: true,
          },
        })
      : await prisma.knowledgeBase.create({
          data: {
            name: KNOWLEDGE_BASE_NAME,
            description:
              "Шаблоны ключевых заявлений для вступления в профсоюз МООП РЗ и оформления членских взносов.",
            isActive: true,
          },
        });

    const queuedDocumentIds: string[] = [];

    for (const doc of documents) {
      const existing = await prisma.knowledgeDocument.findFirst({
        where: {
          knowledgeBaseId: kbRecord.id,
          originalName: doc.originalName,
        },
        include: {
          source: true,
        },
      });

      let fileMeta = null;
      try {
        fileMeta = await copyToUploads(doc.sourcePath, doc.originalName);
      } catch (error) {
        console.warn(`Не удалось скопировать файл ${doc.originalName}:`, error.message);
      }

      const sourceRecord = existing?.sourceId
        ? await prisma.knowledgeSource.update({
            where: { id: existing.sourceId },
            data: {
              type: "FILE",
              status: "PENDING",
              metadata: {
                description: doc.description,
                mimeType: fileMeta?.fileType,
                size: fileMeta?.fileSize ?? existing.fileSize ?? 0,
              },
              lastFetchedAt: new Date(),
            },
          })
        : await prisma.knowledgeSource.create({
            data: {
              knowledgeBaseId: kbRecord.id,
              type: "FILE",
              status: "PENDING",
              title: doc.originalName,
              metadata: {
                description: doc.description,
                mimeType: fileMeta?.fileType,
                size: fileMeta?.fileSize ?? 0,
              },
              lastFetchedAt: new Date(),
            },
          });

      const documentData = {
        fileName: fileMeta?.fileName || doc.originalName,
        originalName: doc.originalName,
        fileType: fileMeta?.fileType || "doc",
        fileSize: fileMeta?.fileSize || 0,
        filePath: fileMeta?.filePath || doc.sourcePath.replace(process.cwd(), ""),
        extractedText: null,
        processingStatus: "QUEUED",
        processedAt: null,
        contentType: "TEXT",
        meta: {
          description: doc.description,
        },
      };

      const documentRecord = existing
        ? await prisma.knowledgeDocument.update({
            where: { id: existing.id },
            data: {
              ...documentData,
              knowledgeBaseId: kbRecord.id,
              sourceId: sourceRecord.id,
            },
          })
        : await prisma.knowledgeDocument.create({
            data: {
              knowledgeBaseId: kbRecord.id,
              ...documentData,
              sourceId: sourceRecord.id,
            },
          });

      await prisma.knowledgeChunk.deleteMany({ where: { documentId: documentRecord.id } });
      queuedDocumentIds.push(documentRecord.id);
    }

    const defaultBot = await prisma.chatBot.findFirst({ where: { isDefault: true } });

    if (!defaultBot) {
      console.warn("⚠️ Бот по умолчанию не найден. Сначала выполните scripts/create-default-bot.mjs");
      return;
    }

    await prisma.chatBotKnowledgeBase.upsert({
      where: {
        chatBotId_knowledgeBaseId: {
          chatBotId: defaultBot.id,
          knowledgeBaseId: kbRecord.id,
        },
      },
      update: {},
      create: {
        chatBotId: defaultBot.id,
        knowledgeBaseId: kbRecord.id,
      },
    });

    if (queuedDocumentIds.length > 0) {
      try {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        const parsed = new URL(redisUrl);
        const connection = {
          host: parsed.hostname,
          port: Number(parsed.port || 6379),
          username: parsed.username || undefined,
          password: parsed.password || undefined,
          tls: parsed.protocol === "rediss:" ? {} : undefined,
        };

        const queue = new Queue("knowledge-ingestion", { connection });
        await Promise.all(
          queuedDocumentIds.map((documentId) =>
            queue.add("process-document", { documentId }),
          ),
        );
        await queue.close();
        console.log(`📥 В очередь на обработку отправлено документов: ${queuedDocumentIds.length}`);
      } catch (queueError) {
        const message = queueError instanceof Error ? queueError.message : String(queueError);
        console.warn("⚠️ Не удалось добавить документы в очередь BullMQ:", message);
        console.warn("   После запуска приложения выполните повторную обработку документов вручную из админки.");
      }
    }

    console.log("✅ База знаний и связь с ботом успешно настроены");
  } catch (error) {
    console.error("Ошибка при настройке базы знаний:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
