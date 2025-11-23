#!/usr/bin/env node

/**
 * Check exact format of models in database
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkModelsFormat() {
  try {
    console.log("🔍 Checking models format in database...\n");

    const provider = await prisma.apiProvider.findFirst({
      where: { name: "openrouter" },
    });

    if (!provider) {
      console.error("❌ OpenRouter not found!");
      process.exit(1);
    }

    console.log(`Provider: ${provider.displayName}`);
    console.log(`availableModels type: ${typeof provider.availableModels}`);
    console.log(`availableModels length: ${provider.availableModels?.length || 0}\n`);

    // Парсим JSON
    let models;
    try {
      models = JSON.parse(provider.availableModels || "[]");
    } catch (e) {
      console.error("❌ Failed to parse:", e.message);
      process.exit(1);
    }

    console.log(`Parsed models:`);
    console.log(`   Type: ${typeof models}`);
    console.log(`   Is Array: ${Array.isArray(models)}`);
    console.log(`   Length: ${models.length}\n`);

    if (models.length > 0) {
      console.log(`First 3 models (detailed):`);
      models.slice(0, 3).forEach((m, i) => {
        console.log(`\n${i + 1}. Type: ${typeof m}`);
        if (typeof m === 'string') {
          console.log(`   Value: "${m}"`);
        } else if (typeof m === 'object' && m !== null) {
          console.log(`   Keys: ${Object.keys(m).join(', ')}`);
          console.log(`   ID: ${m.id}`);
          console.log(`   Name: ${m.name}`);
          console.log(`   Full: ${JSON.stringify(m).substring(0, 100)}...`);
        }
      });
    }

    // Тест сериализации как в API
    const serialized = Array.isArray(models) ? models : [];
    console.log(`\n📤 After serialization:`);
    console.log(`   Length: ${serialized.length}`);
    console.log(`   First item type: ${typeof serialized[0]}`);
    
    if (typeof serialized[0] === 'object') {
      console.log(`   ⚠️  Models are objects! Frontend might have issues.`);
      console.log(`   Need to extract 'id' field.`);
    } else {
      console.log(`   ✅ Models are strings, should work fine.`);
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkModelsFormat();

