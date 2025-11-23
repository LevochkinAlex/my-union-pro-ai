#!/usr/bin/env node

/**
 * Fix Appeal Bot by adding API Provider
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixAppealBot() {
  try {
    console.log("🔧 Fixing Appeal Bot...\n");

    // Найти OpenRouter провайдера
    const openRouter = await prisma.apiProvider.findFirst({
      where: { name: "openrouter" },
    });

    if (!openRouter) {
      console.error("❌ OpenRouter provider not found!");
      console.log("Please create API providers first.");
      process.exit(1);
    }

    console.log(`✅ Found OpenRouter: ${openRouter.id}`);

    // Найти Appeal Bot
    const appealBot = await prisma.chatBot.findFirst({
      where: { 
        OR: [
          { name: "Appeal Bot" },
          { name: { contains: "Appeal" } }
        ]
      },
    });

    if (!appealBot) {
      console.error("❌ Appeal Bot not found!");
      console.log("Please create Appeal Bot first using: node scripts/load-appeal-bot-documents.mjs");
      process.exit(1);
    }

    console.log(`✅ Found Appeal Bot: ${appealBot.id} (${appealBot.name})`);
    console.log(`   Current model: ${appealBot.model || "NOT SET"}`);
    console.log(`   Current provider: ${appealBot.apiProviderId || "NOT SET"}`);

    // Обновить Appeal Bot
    const updated = await prisma.chatBot.update({
      where: { id: appealBot.id },
      data: {
        apiProviderId: openRouter.id,
        model: "openai/gpt-4o", // Лучшая модель
        isActive: true,
      },
    });

    console.log("\n✨ Appeal Bot updated successfully!");
    console.log(`   New model: ${updated.model}`);
    console.log(`   New provider: ${updated.apiProviderId}`);
    console.log(`   Active: ${updated.isActive}`);

    console.log("\n📋 Available models through OpenRouter:");
    console.log("   🔥 openai/gpt-4o (BEST - newest GPT-4)");
    console.log("   🔥 anthropic/claude-3.5-sonnet (BEST - powerful)");
    console.log("   💰 openai/gpt-4o-mini (Budget friendly)");
    console.log("   ⚡ openai/gpt-4-turbo");
    console.log("   ⚡ anthropic/claude-3-haiku");
    console.log("   🌟 google/gemini-pro-1.5");
    console.log("   🌟 meta-llama/llama-3.1-405b-instruct");

    console.log("\n✅ Done! You can now use Appeal Bot.");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixAppealBot();

