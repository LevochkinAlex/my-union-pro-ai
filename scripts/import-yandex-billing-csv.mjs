#!/usr/bin/env node
/**
 * Импорт строк из CSV Yandex Cloud Billing в AIUsageEvent.
 *
 * Для чего: Yandex биллит каждый sku отдельно (input, output, cached, embedding).
 * Часть исторических расходов (до развёртывания `logAIUsage`) не попала в
 * нашу БД. Этот скрипт сверяет суммы по дням: читает CSV, вычитает уже
 * залогированное в AIUsageEvent за этот же день по тому же route/model, и
 * добавляет недостающее одним «сводным» событием в день (route=billing-import).
 *
 * Запуск:
 *   dotenv -e .env.local -- node scripts/import-yandex-billing-csv.mjs path/to/file.csv
 *
 * Идемпотентность: повторный запуск НЕ удваивает суммы — добавляется только
 * разница между CSV и тем, что уже есть в БД.
 *
 * Оценка входящих/исходящих токенов при ресолве модели:
 *   - `YandexGPT Pro 5 input/output/cached` → model=yandexgpt  (кэш маппится в input)
 *   - `YandexGPT Lite 5 input/output` → model=yandexgpt-lite
 *   - `Эмбеддинг текста` + sku `text-search-doc` → model=text-search-doc, op=embedding
 *   - `Эмбеддинг текста` + sku `text-search-query` → model=text-search-query, op=embedding
 *   - Остальное (Monium и т.п.) пропускаем.
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function parseCsvLine(line) {
  // Простой CSV-парсер: поля могут быть в кавычках с запятыми внутри.
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = parseCsvLine(l);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? "";
    });
    return obj;
  });
}

/**
 * Мапит строку Yandex CSV → { route, model, operation, inputTokens, outputTokens, costKopecks }
 * или null, если строку игнорируем (не LLM).
 */
function rowToEvent(row) {
  const skuName = row["sku_name"] || "";
  const quantityK = parseFloat(row["pricing_quantity"] || "0");
  const unit = row["pricing_unit"] || "";
  const costRub = parseFloat(row["cost"] || "0");

  if (!skuName || !Number.isFinite(quantityK) || !Number.isFinite(costRub)) {
    return null;
  }

  // Все интересующие нас метрики — в единицах «1k*token» или «1k*unit».
  if (unit !== "1k*token" && unit !== "1k*unit") return null;

  const tokens = Math.round(quantityK * 1000);
  const costKopecks = Math.round(costRub * 100);

  // Определяем модель и вид операции
  const lower = skuName.toLowerCase();
  let model = null;
  let operation = "chat";
  let inputTokens = 0;
  let outputTokens = 0;

  if (lower.includes("lite")) {
    model = "yandexgpt-lite";
  } else if (lower.includes("pro")) {
    model = "yandexgpt";
  } else if (lower.includes("эмбеддинг")) {
    operation = "embedding";
    const modelUri = row["label.user_labels.model"] || "";
    if (modelUri.includes("text-search-query")) {
      model = "text-search-query";
    } else {
      model = "text-search-doc";
    }
  } else {
    // Monium и прочее — не LLM
    return null;
  }

  if (lower.includes("входящ") || lower.includes("кеш") || operation === "embedding") {
    inputTokens = tokens;
  } else if (lower.includes("исходящ")) {
    outputTokens = tokens;
  }

  return { operation, model, inputTokens, outputTokens, costKopecks, date: row["date"] };
}

/**
 * Суммируем CSV-строки по (дата, operation, model): один CSV обычно содержит
 * несколько строк на тот же день (input/output/cached) — мы их объединяем
 * в одно событие импорта, чтобы не засорять БД.
 */
function aggregateByDayAndModel(rows) {
  const acc = new Map();
  for (const r of rows) {
    const key = `${r.date}|${r.operation}|${r.model}`;
    const cur = acc.get(key) ?? {
      date: r.date,
      operation: r.operation,
      model: r.model,
      inputTokens: 0,
      outputTokens: 0,
      costKopecks: 0,
    };
    cur.inputTokens += r.inputTokens;
    cur.outputTokens += r.outputTokens;
    cur.costKopecks += r.costKopecks;
    acc.set(key, cur);
  }
  return Array.from(acc.values());
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Использование: node scripts/import-yandex-billing-csv.mjs <path/to/file.csv>");
    process.exit(1);
  }

  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error("Файл не найден:", abs);
    process.exit(1);
  }

  const text = fs.readFileSync(abs, "utf-8");
  const rows = parseCsv(text)
    .map(rowToEvent)
    .filter((r) => r != null);

  const aggregated = aggregateByDayAndModel(rows);
  console.log(`📥 Строк в CSV после маппинга: ${rows.length}`);
  console.log(`📊 Агрегировано по (дата, модель): ${aggregated.length}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const a of aggregated) {
    const dayStart = new Date(a.date + "T00:00:00Z");
    const dayEnd = new Date(a.date + "T23:59:59Z");

    // Считаем, что уже есть в БД за этот день по этой модели
    const existing = await prisma.aIUsageEvent.aggregate({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        operation: a.operation,
        model: a.model,
      },
      _sum: { inputTokens: true, outputTokens: true, costKopecks: true },
    });

    const haveInput = existing._sum.inputTokens ?? 0;
    const haveOutput = existing._sum.outputTokens ?? 0;
    const haveCost = existing._sum.costKopecks ?? 0;

    const deltaInput = Math.max(0, a.inputTokens - haveInput);
    const deltaOutput = Math.max(0, a.outputTokens - haveOutput);
    const deltaCost = Math.max(0, a.costKopecks - haveCost);

    if (deltaInput === 0 && deltaOutput === 0 && deltaCost === 0) {
      skipped++;
      continue;
    }

    // Ищем уже импортированное сводное событие за этот день/модель
    const existingImport = await prisma.aIUsageEvent.findFirst({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        operation: a.operation,
        model: a.model,
        route: "billing-import",
      },
    });

    if (existingImport) {
      await prisma.aIUsageEvent.update({
        where: { id: existingImport.id },
        data: {
          inputTokens: existingImport.inputTokens + deltaInput,
          outputTokens: existingImport.outputTokens + deltaOutput,
          totalTokens: existingImport.totalTokens + deltaInput + deltaOutput,
          costKopecks: existingImport.costKopecks + deltaCost,
        },
      });
      updated++;
    } else {
      // timestamp — полдень этого дня, чтобы при выборке «за сутки» событие
      // попадало в нужный бакет независимо от таймзоны.
      const ts = new Date(a.date + "T12:00:00Z");
      await prisma.aIUsageEvent.create({
        data: {
          createdAt: ts,
          provider: "yandex",
          model: a.model,
          operation: a.operation,
          route: "billing-import",
          inputTokens: deltaInput,
          outputTokens: deltaOutput,
          totalTokens: deltaInput + deltaOutput,
          costKopecks: deltaCost,
          status: "ok",
        },
      });
      inserted++;
    }

    console.log(
      `  ${a.date} ${a.model} (${a.operation}): +in=${deltaInput} +out=${deltaOutput} +cost=${deltaCost}коп`,
    );
  }

  console.log(`\n✅ Готово. Создано: ${inserted}, обновлено: ${updated}, пропущено (уже в БД): ${skipped}`);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
