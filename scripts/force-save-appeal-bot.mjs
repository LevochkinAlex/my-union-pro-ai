#!/usr/bin/env node

/**
 * Force save Appeal Bot with correct configuration
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function forceSave() {
  try {
    console.log("💾 Force saving Appeal Bot...\n");

    const bot = await prisma.chatBot.findFirst({
      where: { name: { contains: "Appeal" } },
    });

    if (!bot) {
      console.error("❌ Appeal Bot not found!");
      process.exit(1);
    }

    const openRouter = await prisma.apiProvider.findFirst({
      where: { name: "openrouter" },
    });

    if (!openRouter) {
      console.error("❌ OpenRouter not found!");
      process.exit(1);
    }

    const appealKB = await prisma.knowledgeBase.findFirst({
      where: { name: { contains: "Appeal Bot" } },
    });

    if (!appealKB) {
      console.error("❌ Appeal Bot KB not found!");
      process.exit(1);
    }

    console.log("📋 Current config:");
    console.log(`   Model: ${bot.model}`);
    console.log(`   Provider: ${bot.apiProviderId}`);
    
    // Принудительно сохраняем правильную конфигурацию
    const updated = await prisma.chatBot.update({
      where: { id: bot.id },
      data: {
        name: "Appeal Bot",
        description: "Bot for handling user appeals and requests (legal, accounting, technical, etc.)",
        model: "openai/gpt-4o", // СТРОКА, не объект
        apiProviderId: openRouter.id,
        temperature: 0.7,
        maxTokens: 1000,
        isActive: true,
        tone: "professional",
      },
    });

    // Убедимся что правильная БЗ привязана
    await prisma.chatBotKnowledgeBase.deleteMany({
      where: { chatBotId: bot.id },
    });

    await prisma.chatBotKnowledgeBase.create({
      data: {
        chatBotId: bot.id,
        knowledgeBaseId: appealKB.id,
      },
    });

    console.log("\n✨ Appeal Bot saved!");
    console.log(`   Model: "${updated.model}" (${typeof updated.model})`);
    console.log(`   Provider: ${updated.apiProviderId}`);
    console.log(`   Active: ${updated.isActive}`);
    console.log(`   KB: Appeal Bot Knowledge Base`);

    console.log("\n✅ Try loading the bot page again!");
    console.log("   The model should be: openai/gpt-4o");
    console.log("   And you should be able to save without errors.");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

forceSave();

