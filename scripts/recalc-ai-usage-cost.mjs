#!/usr/bin/env node
/**
 * Пересчёт поля `costKopecks` у всех AIUsageEvent по актуальным ценам из
 * `lib/ai-usage.ts`. Запускается после изменения прайса Yandex (чтобы
 * исторические записи не врали).
 *
 * Запуск:
 *   dotenv -e .env.local -- node scripts/recalc-ai-usage-cost.mjs
 *
 * Идемпотентно: пересчитывает всех без условий по тарифной таблице ниже.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Должно совпадать с YANDEX_PRICING_RUB_PER_1K из lib/ai-usage.ts.
// Синхронизировать вручную.
const PRICING = {
  yandexgpt: { input: 1.2, output: 1.2 },
  "yandexgpt-32k": { input: 1.2, output: 1.2 },
  "yandexgpt-5-pro": { input: 1.2, output: 1.2 },
  "yandexgpt-lite": { input: 0.2, output: 0.2 },
  "yandexgpt-5-lite": { input: 0.2, output: 0.2 },
  "text-search-doc": { input: 0.01, output: 0 },
  "text-search-query": { input: 0.01, output: 0 },
};

function calcKopecks(model, inputTokens, outputTokens) {
  const p = PRICING[model];
  if (!p) return 0;
  const rub = (inputTokens * p.input) / 1000 + (outputTokens * p.output) / 1000;
  return Math.round(rub * 100);
}

async function main() {
  console.log("🔄 Пересчёт costKopecks по актуальным тарифам\n");

  const BATCH = 500;
  let offset = 0;
  let total = 0;
  let updated = 0;

  for (;;) {
    const events = await prisma.aIUsageEvent.findMany({
      skip: offset,
      take: BATCH,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costKopecks: true,
      },
    });
    if (events.length === 0) break;
    total += events.length;

    for (const ev of events) {
      const next = calcKopecks(ev.model, ev.inputTokens, ev.outputTokens);
      if (next !== ev.costKopecks) {
        await prisma.aIUsageEvent.update({
          where: { id: ev.id },
          data: { costKopecks: next },
        });
        updated++;
      }
    }

    if (events.length < BATCH) break;
    offset += BATCH;
  }

  console.log(`✅ Обработано ${total}, обновлено ${updated}`);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
