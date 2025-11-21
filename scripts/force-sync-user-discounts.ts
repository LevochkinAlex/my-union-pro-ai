#!/usr/bin/env tsx
/**
 * Force sync user's claimed discounts from BestBenefits to local DB
 */
import { PrismaClient } from "@prisma/client";
import { getUserActivatedDiscounts } from "../lib/best-benefits-activation";
import { decryptPassword } from "../lib/best-benefits-password";

const prisma = new PrismaClient();

async function forceSyncUserDiscounts(email: string) {
  console.log(`🔄 Force syncing discounts for: ${email}\n`);

  // 1. Find user
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      bestBenefitsUserId: true,
      bestBenefitsPassword: true,
    },
  });

  if (!user) {
    console.error(`❌ User not found: ${email}`);
    process.exit(1);
  }

  if (!user.bestBenefitsUserId) {
    console.error(`❌ User is not synced with BestBenefits`);
    process.exit(1);
  }

  if (!user.bestBenefitsPassword) {
    console.error(`❌ User has no BestBenefits password`);
    process.exit(1);
  }

  console.log(`✅ User found:`, {
    id: user.id,
    email: user.email,
    bbUserId: user.bestBenefitsUserId,
  });

  // 2. Decrypt password
  let userPassword: string;
  try {
    userPassword = decryptPassword(user.bestBenefitsPassword);
    console.log(`✅ Password decrypted\n`);
  } catch (error) {
    console.error(`❌ Failed to decrypt password:`, error);
    process.exit(1);
  }

  // 3. Fetch from BestBenefits
  console.log(`🔄 Fetching activated discounts from BestBenefits...`);
  const bbActivated = await getUserActivatedDiscounts(
    user.bestBenefitsUserId,
    userPassword
  );

  console.log(`✅ Found ${bbActivated.length} activated discounts in BestBenefits\n`);

  // 4. Update local DB
  console.log(`💾 Updating local database...`);

  // Find or create preferences
  let preferences = await prisma.discountPreference.findUnique({
    where: { userId: user.id },
  });

  if (!preferences) {
    preferences = await prisma.discountPreference.create({
      data: {
        userId: user.id,
        filters: {
          claimed: [],
          favorites: [],
        },
      },
    });
  }

  // Replace claimed with BestBenefits data
  const updatedClaimed = bbActivated.map((bbItem) => ({
    id: bbItem.id,
    promoCode: bbItem.promoCode,
  }));

  await prisma.discountPreference.update({
    where: { userId: user.id },
    data: {
      filters: {
        ...(preferences.filters as Record<string, unknown>),
        claimed: updatedClaimed,
      },
    },
  });

  console.log(`✅ Local database updated!\n`);
  console.log(`📊 Claimed discounts (${updatedClaimed.length}):`);
  updatedClaimed.forEach((item, idx) => {
    console.log(`   ${idx + 1}. ID: ${item.id}, Promo: ${item.promoCode || "N/A"}`);
  });

  console.log(`\n✅ Sync completed!`);
}

// Main
const email = process.argv[2];

if (!email) {
  console.error("❌ Usage: tsx scripts/force-sync-user-discounts.ts <email>");
  process.exit(1);
}

forceSyncUserDiscounts(email)
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

