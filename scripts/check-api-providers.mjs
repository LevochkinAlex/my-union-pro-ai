#!/usr/bin/env node

/**
 * Check what API providers return
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkApiProviders() {
  try {
    console.log("🔍 Checking API Providers...\n");

    const providers = await prisma.apiProvider.findMany({
      orderBy: { createdAt: "asc" },
    });

    console.log(`📋 Found ${providers.length} providers:\n`);

    for (const provider of providers) {
      console.log(`Provider: ${provider.displayName} (${provider.name})`);
      console.log(`   ID: ${provider.id}`);
      console.log(`   Active: ${provider.isActive}`);
      console.log(`   Default: ${provider.isDefault}`);
      
      // Попробуем распарсить модели
      let models = [];
      try {
        models = JSON.parse(provider.availableModels || "[]");
      } catch (e) {
        console.log(`   ❌ Failed to parse models:`, e.message);
      }
      
      console.log(`   Models: ${Array.isArray(models) ? models.length : 'NOT AN ARRAY'}`);
      
      if (Array.isArray(models) && models.length > 0) {
        console.log(`   First 5 models:`);
        models.slice(0, 5).forEach((m, i) => {
          if (typeof m === 'string') {
            console.log(`     ${i + 1}. ${m}`);
          } else if (typeof m === 'object' && m !== null) {
            console.log(`     ${i + 1}. ${m.id || m.name || JSON.stringify(m)}`);
          } else {
            console.log(`     ${i + 1}. [UNKNOWN TYPE: ${typeof m}]`);
          }
        });
      } else {
        console.log(`   ⚠️  No models available!`);
      }
      console.log();
    }

    console.log("✅ Done");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkApiProviders();

