#!/usr/bin/env tsx
/**
 * Удаляет из локальных preferences все скидки, которые не активированы в BestBenefits
 * Использование: pnpm dotenv -e .env.local -- tsx scripts/cleanup-unactivated-discounts.ts <email>
 */

import { PrismaClient } from "@prisma/client";
import { getUserActivatedDiscounts } from "../lib/best-benefits-activation";

const prisma = new PrismaClient();

async function cleanupUnactivatedDiscounts(email: string) {
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

    if (!user.bestBenefitsUserId) {
      console.error(`❌ User not synced to BestBenefits`);
      process.exit(1);
    }

    console.log(`🔗 BestBenefits User ID: ${user.bestBenefitsUserId}`);

    if (!user.discountPreference) {
      console.log(`⚠️ No discount preferences found`);
      process.exit(0);
    }

    const filters = (user.discountPreference.filters as any) || {};
    const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];

    console.log(`\n📋 Current claimed discounts (${claimed.length}):`);
    claimed.forEach((item: any) => {
      const id = typeof item === "object" && item.id ? item.id : item;
      const promoCode = typeof item === "object" && item.promoCode ? item.promoCode : null;
      console.log(`  - ID: ${id}, PromoCode: ${promoCode || "none"}`);
    });

    // Get activated discounts from BestBenefits
    console.log(`\n🔄 Fetching activated discounts from BestBenefits...`);
    const bbActivated = await getUserActivatedDiscounts(user.bestBenefitsUserId);

    console.log(`\n✅ Activated in BestBenefits (${bbActivated.length}):`);
    bbActivated.forEach((item: any) => {
      console.log(`  - ID: ${item.id}, PromoCode: ${item.promoCode || "none"}`);
    });

    const bbActivatedIds = new Set(bbActivated.map((d) => d.id));

    // Find discounts to remove (claimed locally but not in BestBenefits)
    const toRemove: number[] = [];
    claimed.forEach((item: any) => {
      const id = typeof item === "object" && item.id ? item.id : item;
      if (!bbActivatedIds.has(id)) {
        toRemove.push(id);
      }
    });

    if (toRemove.length === 0) {
      console.log(`\n✅ All claimed discounts are activated in BestBenefits. Nothing to remove.`);
      process.exit(0);
    }

    console.log(`\n❌ Discounts to remove (${toRemove.length}):`);
    toRemove.forEach((id) => {
      console.log(`  - ID: ${id}`);
    });

    // Remove unactivated discounts
    const updatedClaimed = claimed.filter((item: any) => {
      const itemId = typeof item === "object" && item.id ? item.id : item;
      return bbActivatedIds.has(itemId);
    });

    console.log(`\n📋 Updated claimed discounts (${updatedClaimed.length}):`);
    updatedClaimed.forEach((item: any) => {
      const id = typeof item === "object" && item.id ? item.id : item;
      const promoCode = typeof item === "object" && item.promoCode ? item.promoCode : null;
      console.log(`  - ID: ${id}, PromoCode: ${promoCode || "none"}`);
    });

    // Update preferences
    await prisma.discountPreference.update({
      where: { userId: user.id },
      data: {
        filters: {
          ...filters,
          claimed: updatedClaimed,
        },
      },
    });

    console.log(`\n✅ Successfully removed ${toRemove.length} unactivated discounts`);
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
  console.error("Usage: pnpm dotenv -e .env.local -- tsx scripts/cleanup-unactivated-discounts.ts <email>");
  process.exit(1);
}

cleanupUnactivatedDiscounts(email);

