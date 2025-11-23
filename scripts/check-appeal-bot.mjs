#!/usr/bin/env node

/**
 * Check Appeal Bot configuration
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkAppealBot() {
  try {
    console.log("🔍 Checking Appeal Bot configuration...\n");

    const bot = await prisma.chatBot.findFirst({
      where: { name: { contains: "Appeal" } },
      include: {
        apiProvider: true,
        knowledgeBases: {
          include: {
            knowledgeBase: true,
          },
        },
      },
    });

    if (!bot) {
      console.error("❌ Appeal Bot not found!");
      process.exit(1);
    }

    console.log("📋 Current Configuration:");
    console.log(`   ID: ${bot.id}`);
    console.log(`   Name: ${bot.name}`);
    console.log(`   Model: "${bot.model}" (type: ${typeof bot.model})`);
    console.log(`   API Provider ID: ${bot.apiProviderId || "NOT SET"}`);
    console.log(`   API Provider: ${bot.apiProvider?.name || "NOT SET"}`);
    console.log(`   Active: ${bot.isActive}`);
    console.log(`   Temperature: ${bot.temperature}`);
    console.log(`   Max Tokens: ${bot.maxTokens}`);
    
    console.log(`\n📚 Knowledge Bases:`);
    bot.knowledgeBases.forEach(kb => {
      console.log(`   - ${kb.knowledgeBase.name}`);
    });

    // Проверка валидности
    const issues = [];
    
    if (!bot.model || typeof bot.model !== 'string' || bot.model.trim() === '') {
      issues.push("❌ Model is empty or invalid");
    }
    
    if (!bot.apiProviderId) {
      issues.push("❌ API Provider is not set");
    }
    
    if (bot.knowledgeBases.length === 0) {
      issues.push("⚠️  No knowledge bases linked");
    }

    if (issues.length > 0) {
      console.log(`\n⚠️  Issues found:`);
      issues.forEach(issue => console.log(`   ${issue}`));
      
      console.log(`\n🔧 Fixing issues...`);
      
      // Найти OpenRouter
      const openRouter = await prisma.apiProvider.findFirst({
        where: { name: "openrouter" },
      });
      
      if (!openRouter) {
        console.error("❌ OpenRouter provider not found!");
        process.exit(1);
      }
      
      // Обновить бота
      await prisma.chatBot.update({
        where: { id: bot.id },
        data: {
          model: "openai/gpt-4o",
          apiProviderId: openRouter.id,
          isActive: true,
        },
      });
      
      console.log(`✅ Fixed! Model set to: "openai/gpt-4o"`);
      console.log(`✅ API Provider set to: OpenRouter`);
    } else {
      console.log(`\n✅ Configuration looks good!`);
    }

    console.log(`\n💡 Try again in the browser (refresh the page).`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkAppealBot();

