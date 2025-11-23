#!/usr/bin/env node

/**
 * Upgrade all bots to GPT-4o (best available model)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function upgradeAllBots() {
  try {
    console.log("🚀 Upgrading all bots to GPT-4o...\n");

    // Найти OpenRouter провайдера
    const openRouter = await prisma.apiProvider.findFirst({
      where: { name: "openrouter" },
    });

    if (!openRouter) {
      console.error("❌ OpenRouter provider not found!");
      process.exit(1);
    }

    console.log(`✅ Found OpenRouter: ${openRouter.id}\n`);

    // Найти все боты
    const bots = await prisma.chatBot.findMany();

    console.log(`📋 Found ${bots.length} bots:\n`);

    for (const bot of bots) {
      console.log(`🤖 ${bot.name}`);
      console.log(`   Current: ${bot.model || "NOT SET"} (Provider: ${bot.apiProviderId ? "✓" : "✗"})`);

      await prisma.chatBot.update({
        where: { id: bot.id },
        data: {
          apiProviderId: openRouter.id,
          model: "openai/gpt-4o",
          isActive: true,
        },
      });

      console.log(`   Updated: openai/gpt-4o ✨\n`);
    }

    console.log("✅ All bots upgraded to GPT-4o!");
    console.log("\n🔥 GPT-4o - это самая новая и мощная модель от OpenAI");
    console.log("   Лучше чем GPT-4 Turbo");
    console.log("   Быстрее и дешевле GPT-4");
    console.log("   Поддерживает vision и function calling");

    console.log("\n💡 Альтернативные модели (можете изменить в админке):");
    console.log("   • anthropic/claude-3.5-sonnet - отличная альтернатива");
    console.log("   • openai/gpt-4o-mini - бюджетная версия");
    console.log("   • anthropic/claude-3-opus - самая мощная Claude");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

upgradeAllBots();

