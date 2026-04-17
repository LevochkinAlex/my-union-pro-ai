#!/usr/bin/env node
/**
 * Перегенерация эмбеддингов KnowledgeChunk и UserKnowledgeChunk на Yandex (256-dim).
 *
 * Запуск:
 *   dotenv -e .env.local -- node scripts/regen-embeddings-yandex.mjs
 *
 * Логика:
 * 1. Читает все чанки, у которых embedding пустой или размерности != 256.
 * 2. Для каждого генерит Yandex text-search-doc embedding (256-dim) через API.
 * 3. Записывает обратно в БД. Обрабатывает батчами, с rate limit.
 * 4. Прогресс и итог печатает в stdout.
 *
 * Скрипт идемпотентный — повторный запуск не переделывает уже мигрированные чанки.
 */

import { PrismaClient } from "@prisma/client";

const TARGET_DIM = 256;
const BATCH_SIZE = 20; // сколько чанков читать за раз
const SLEEP_MS = 200; // пауза между запросами, чтобы не упереться в rate limit

const API_KEY = process.env.YANDEX_AI_STUDIO_API_KEY;
const FOLDER_ID = process.env.YANDEX_CLOUD_FOLDER_ID;

if (!API_KEY || !FOLDER_ID) {
  console.error(
    "❌ YANDEX_AI_STUDIO_API_KEY и YANDEX_CLOUD_FOLDER_ID обязательны. " +
      "Запускайте через `dotenv -e .env.local -- node scripts/regen-embeddings-yandex.mjs`",
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateYandexDocEmbedding(text) {
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
    throw new Error(`Yandex embedding ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.embedding)) {
    throw new Error("Yandex вернул embedding не в виде массива");
  }
  return data.embedding;
}

async function processChunks({ modelName, fetchChunks, updateChunk }) {
  console.log(`\n=== ${modelName} ===`);

  let total = 0;
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  let offset = 0;

  for (;;) {
    const batch = await fetchChunks(offset, BATCH_SIZE);
    if (batch.length === 0) break;
    total += batch.length;

    for (const chunk of batch) {
      const existing = Array.isArray(chunk.embedding) ? chunk.embedding : [];
      if (existing.length === TARGET_DIM) {
        skipped++;
        continue;
      }

      const textRaw = typeof chunk.content === "string" ? chunk.content : String(chunk.content ?? "");
      const text = textRaw.replace(/\s+/g, " ").trim();
      if (!text) {
        // Пустой текст — оставляем эмбеддинг пустым (поиск его и так пропустит)
        await updateChunk(chunk.id, []).catch(() => {});
        skipped++;
        continue;
      }

      try {
        const vec = await generateYandexDocEmbedding(text.slice(0, 8000));
        await updateChunk(chunk.id, vec);
        migrated++;
        if (migrated % 50 === 0) {
          console.log(`  migrated=${migrated} skipped=${skipped} errors=${errors}`);
        }
        await sleep(SLEEP_MS);
      } catch (err) {
        errors++;
        console.error(`  ❌ chunk ${chunk.id}:`, err?.message ?? err);
        // Пауза чуть дольше при ошибке
        await sleep(SLEEP_MS * 5);
      }
    }

    // Если последняя страница короче batch — выходим
    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(
    `--- ${modelName} done: total=${total} migrated=${migrated} skipped=${skipped} errors=${errors}`,
  );
  return { total, migrated, skipped, errors };
}

async function main() {
  console.log("🔄 Перегенерация эмбеддингов на Yandex (256-dim)");
  console.log("   FOLDER_ID:", FOLDER_ID);
  console.log("   BATCH_SIZE:", BATCH_SIZE, "SLEEP_MS:", SLEEP_MS);

  // KnowledgeChunk (основная база знаний)
  const kb = await processChunks({
    modelName: "KnowledgeChunk",
    fetchChunks: (skip, take) =>
      prisma.knowledgeChunk.findMany({
        skip,
        take,
        orderBy: { createdAt: "asc" },
        select: { id: true, content: true, embedding: true },
      }),
    updateChunk: (id, embedding) =>
      prisma.knowledgeChunk.update({ where: { id }, data: { embedding } }),
  });

  // UserKnowledgeChunk (персональные знания пользователя)
  const ukb = await processChunks({
    modelName: "UserKnowledgeChunk",
    fetchChunks: (skip, take) =>
      prisma.userKnowledgeChunk.findMany({
        skip,
        take,
        orderBy: { createdAt: "asc" },
        select: { id: true, content: true, embedding: true },
      }),
    updateChunk: (id, embedding) =>
      prisma.userKnowledgeChunk.update({ where: { id }, data: { embedding } }),
  });

  console.log("\n✅ Готово");
  console.log("  KnowledgeChunk:", kb);
  console.log("  UserKnowledgeChunk:", ukb);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
