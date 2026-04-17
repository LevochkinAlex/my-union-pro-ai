#!/usr/bin/env node
/**
 * Миграция существующих ChatBot с legacy-моделей (openai/gpt-*, anthropic/*,
 * openrouter/auto) на Yandex Foundation Models.
 *
 * Что делает:
 * 1. Гарантирует, что существует активный провайдер `yandex`.
 * 2. Для каждого ChatBot:
 *    - Если модель из legacy-набора — меняет на её Yandex-эквивалент.
 *    - Переключает apiProviderId на yandex.
 * 3. Ставит legacy-провайдерам (openrouter/openai/anthropic) isActive=false,
 *    isDefault=false. Удалять не стали, чтобы сохранить историю.
 *
 * Запуск:
 *   dotenv -e .env.local -- node scripts/migrate-bots-to-yandex.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Соответствие legacy-моделей Yandex-моделям (в соответствии с таблицей алиасов из lib/yandex-ai.ts)
const MODEL_MAP = {
  "openai/gpt-4o": "yandexgpt",
  "openai/gpt-4o-mini": "yandexgpt-lite",
  "openai/gpt-4-turbo": "yandexgpt",
  "openai/gpt-4": "yandexgpt",
  "openai/gpt-3.5-turbo": "yandexgpt-lite",
  "openrouter/auto": "yandexgpt",
  "gpt-4o": "yandexgpt",
  "gpt-4o-mini": "yandexgpt-lite",
  "gpt-4-turbo": "yandexgpt",
  "gpt-4": "yandexgpt",
  "gpt-3.5-turbo": "yandexgpt-lite",
  "anthropic/claude-3-5-sonnet": "yandexgpt",
  "anthropic/claude-3-5-sonnet-20241022": "yandexgpt",
  "anthropic/claude-3-opus": "yandexgpt",
  "anthropic/claude-3-sonnet": "yandexgpt",
  "anthropic/claude-3-haiku": "yandexgpt-lite",
};

const YANDEX_MODELS_LIST = [
  "yandexgpt",
  "yandexgpt-lite",
  "yandexgpt-32k",
  "yandexgpt-5-pro",
  "yandexgpt-5-lite",
];

async function ensureYandexProvider() {
  const existing = await prisma.apiProvider.findUnique({ where: { name: "yandex" } });
  if (existing) {
    if (!existing.isActive || !existing.isDefault) {
      await prisma.apiProvider.update({
        where: { id: existing.id },
        data: { isActive: true, isDefault: true },
      });
    }
    return existing.id;
  }
  const created = await prisma.apiProvider.create({
    data: {
      name: "yandex",
      displayName: "Yandex Foundation Models",
      description:
        "YandexGPT — основной ИИ-провайдер платформы (совместим с РФ-блокировками).",
      apiBaseUrl: "https://llm.api.cloud.yandex.net/foundationModels/v1",
      availableModels: JSON.stringify(YANDEX_MODELS_LIST),
      isActive: true,
      isDefault: true,
    },
  });
  return created.id;
}

async function deactivateLegacyProviders() {
  // Снимаем isDefault и isActive у всех не-Yandex провайдеров
  const res = await prisma.apiProvider.updateMany({
    where: { name: { not: "yandex" } },
    data: { isActive: false, isDefault: false },
  });
  return res.count;
}

async function migrateBots(yandexProviderId) {
  const bots = await prisma.chatBot.findMany({
    select: { id: true, name: true, model: true, apiProviderId: true },
  });
  let updated = 0;
  for (const bot of bots) {
    const mapped = MODEL_MAP[bot.model];
    // Обновляем, если модель из legacy-таблицы ИЛИ провайдер не yandex
    const needModelChange = Boolean(mapped);
    const needProviderChange = bot.apiProviderId !== yandexProviderId;
    if (!needModelChange && !needProviderChange) continue;

    const newModel = mapped ?? bot.model;
    await prisma.chatBot.update({
      where: { id: bot.id },
      data: {
        ...(needModelChange ? { model: newModel, providerOverride: null } : {}),
        apiProviderId: yandexProviderId,
      },
    });
    console.log(
      `  • ${bot.name}: ${bot.model}${needModelChange ? ` → ${newModel}` : ""}${
        needProviderChange ? " + provider=yandex" : ""
      }`,
    );
    updated++;
  }
  return { total: bots.length, updated };
}

async function main() {
  console.log("🔄 Миграция ботов на Yandex Foundation Models\n");

  const providerId = await ensureYandexProvider();
  console.log("✅ Провайдер yandex:", providerId);

  const legacyDeactivated = await deactivateLegacyProviders();
  console.log(`✅ Legacy-провайдеров деактивировано: ${legacyDeactivated}`);

  const { total, updated } = await migrateBots(providerId);
  console.log(`\n📊 Ботов всего: ${total}, обновлено: ${updated}`);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
