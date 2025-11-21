#!/usr/bin/env tsx
/**
 * Полностью очищает все claimed и favorites скидки пользователя
 * Использование: pnpm dotenv -e .env.local -- tsx scripts/clear-all-claimed.ts <email>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearAllClaimed(email: string) {
  try {
    console.log(`🔍 Searching for user: ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        discountPreference: true,
      },
    });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.id}`);

    if (!user.discountPreference) {
      console.log(`⚠️ No discount preferences found - nothing to clear`);
      process.exit(0);
    }

    const filters = (user.discountPreference.filters as any) || {};
    const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];
    const favorites = Array.isArray(filters.favorites) ? filters.favorites : [];

    console.log(`\n📋 Current state:`);
    console.log(`  - Claimed: ${claimed.length} discounts`);
    console.log(`  - Favorites: ${favorites.length} discounts`);

    if (claimed.length === 0 && favorites.length === 0) {
      console.log(`\n✅ Already clean - nothing to clear`);
      process.exit(0);
    }

    // Очищаем все
    await prisma.discountPreference.update({
      where: { userId: user.id },
      data: {
        filters: {
          ...filters,
          claimed: [],
          favorites: [],
        },
      },
    });

    console.log(`\n✅ Successfully cleared all discounts!`);
    console.log(`  - Claimed: 0`);
    console.log(`  - Favorites: 0`);
    console.log(`\n🎉 You can now start fresh!`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get arguments
const email = process.argv[2];

if (!email) {
  console.error("Usage: pnpm dotenv -e .env.local -- tsx scripts/clear-all-claimed.ts <email>");
  process.exit(1);
}

clearAllClaimed(email);

