#!/usr/bin/env node

/**
 * Fix Appeal Bot Knowledge Base linkage
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixAppealBotKB() {
  try {
    console.log("🔧 Fixing Appeal Bot Knowledge Base...\n");

    // Найти Appeal Bot
    const appealBot = await prisma.chatBot.findFirst({
      where: { 
        OR: [
          { name: "Appeal Bot" },
          { name: { contains: "Appeal" } }
        ]
      },
      include: {
        knowledgeBases: {
          include: {
            knowledgeBase: true,
          },
        },
      },
    });

    if (!appealBot) {
      console.error("❌ Appeal Bot not found!");
      process.exit(1);
    }

    console.log(`✅ Found Appeal Bot: ${appealBot.name} (${appealBot.id})`);
    console.log(`\n📚 Current knowledge bases:`);
    appealBot.knowledgeBases.forEach(kb => {
      console.log(`   - ${kb.knowledgeBase.name} (${kb.knowledgeBase.id})`);
    });

    // Найти правильную базу знаний для Appeal Bot
    const appealKB = await prisma.knowledgeBase.findFirst({
      where: { 
        OR: [
          { name: "Appeal Bot Knowledge Base" },
          { name: { contains: "Appeal" } }
        ]
      },
    });

    if (!appealKB) {
      console.error("\n❌ Appeal Bot Knowledge Base not found!");
      console.log("Creating it now...");
      
      const newKB = await prisma.knowledgeBase.create({
        data: {
          name: "Appeal Bot Knowledge Base",
          description: "База знаний для Appeal Bot с документами профсоюза",
          isActive: true,
        },
      });
      
      console.log(`✅ Created new KB: ${newKB.name} (${newKB.id})`);
      
      // Привязать к боту
      await prisma.chatBotKnowledgeBase.deleteMany({
        where: { chatBotId: appealBot.id },
      });
      
      await prisma.chatBotKnowledgeBase.create({
        data: {
          chatBotId: appealBot.id,
          knowledgeBaseId: newKB.id,
        },
      });
      
      console.log(`\n✨ Appeal Bot linked to new Knowledge Base!`);
      return;
    }

    console.log(`\n✅ Found correct KB: ${appealKB.name} (${appealKB.id})`);

    // Проверить, привязана ли правильная БЗ
    const isLinked = appealBot.knowledgeBases.some(
      kb => kb.knowledgeBase.id === appealKB.id
    );

    if (isLinked) {
      console.log(`\n✅ Appeal Bot already linked to correct KB!`);
      
      // Но если привязана еще и неправильная, удалим лишние
      if (appealBot.knowledgeBases.length > 1) {
        console.log(`\n🧹 Removing other knowledge bases...`);
        await prisma.chatBotKnowledgeBase.deleteMany({
          where: { 
            chatBotId: appealBot.id,
            knowledgeBaseId: { not: appealKB.id }
          },
        });
        console.log(`✅ Cleaned up extra knowledge bases`);
      }
    } else {
      console.log(`\n🔄 Linking Appeal Bot to correct KB...`);
      
      // Удалить все текущие связи
      await prisma.chatBotKnowledgeBase.deleteMany({
        where: { chatBotId: appealBot.id },
      });
      
      // Создать правильную связь
      await prisma.chatBotKnowledgeBase.create({
        data: {
          chatBotId: appealBot.id,
          knowledgeBaseId: appealKB.id,
        },
      });
      
      console.log(`✅ Appeal Bot linked to correct Knowledge Base!`);
    }

    // Проверить количество документов в базе
    const docs = await prisma.knowledgeDocument.count({
      where: { knowledgeBaseId: appealKB.id },
    });

    console.log(`\n📊 Statistics:`);
    console.log(`   Bot: ${appealBot.name}`);
    console.log(`   KB: ${appealKB.name}`);
    console.log(`   Documents: ${docs}`);

    if (docs === 0) {
      console.log(`\n⚠️  Warning: No documents in Appeal Bot KB!`);
      console.log(`   Run: node scripts/load-appeal-bot-documents.mjs`);
    }

    console.log(`\n✅ Done! Refresh the page and try again.`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixAppealBotKB();

