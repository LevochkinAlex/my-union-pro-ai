import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({ path: "./.env.local" });

const prisma = new PrismaClient();

const FOLDER_ID = process.env.YANDEX_CLOUD_FOLDER_ID;
const API_KEY = process.env.YANDEX_AI_STUDIO_API_KEY;
const SLEEP_MS = 200;

const KB_ID = process.argv[2] || process.env.KB_ID || null;

function splitTextIntoChunks(text, chunkSize = 500, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 50);
}

async function getYandexDocEmbedding(text) {
  if (!FOLDER_ID || !API_KEY) {
    throw new Error("YANDEX_AI_STUDIO_API_KEY / YANDEX_CLOUD_FOLDER_ID не заданы");
  }
  const modelUri = `emb://${FOLDER_ID}/text-search-doc/latest`;
  const response = await fetch(
    "https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${API_KEY}`,
      },
      body: JSON.stringify({ modelUri, text }),
    },
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Yandex embedding ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  if (!Array.isArray(data.embedding)) {
    throw new Error("Yandex embedding: пустой ответ");
  }
  return data.embedding;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🔄 Создание chunks (Yandex embeddings, 256-dim)...");

  const where = { processingStatus: "COMPLETED" };
  if (KB_ID) where.knowledgeBaseId = KB_ID;

  const docs = await prisma.knowledgeDocument.findMany({ where });
  console.log(`📄 Найдено ${docs.length} документов`);

  for (const doc of docs) {
    console.log(`\n• ${doc.fileName || doc.originalName}`);
    if (!doc.extractedText) {
      console.log("  ⏭️  Нет текста");
      continue;
    }

    const textChunks =
      doc.extractedText.length < 600
        ? [doc.extractedText]
        : splitTextIntoChunks(doc.extractedText, 300, 50);

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      try {
        const embedding = await getYandexDocEmbedding(chunk.slice(0, 8000));
        await prisma.knowledgeChunk.create({
          data: {
            knowledgeBaseId: doc.knowledgeBaseId,
            documentId: doc.id,
            content: chunk,
            embedding,
            chunkIndex: i,
            metadata: { fileName: doc.fileName || doc.originalName },
          },
        });
        await sleep(SLEEP_MS);
      } catch (err) {
        console.error(`  ❌ chunk ${i + 1}:`, err?.message ?? err);
      }
    }
    console.log(`  ✅ Сохранено ${textChunks.length} chunk(s)`);
  }

  const totalWhere = KB_ID ? { knowledgeBaseId: KB_ID } : {};
  const totalChunks = await prisma.knowledgeChunk.count({ where: totalWhere });
  console.log(`\n🎉 Готово. Всего chunks в БД: ${totalChunks}`);
}

main()
  .catch((err) => {
    console.error("❌ FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
