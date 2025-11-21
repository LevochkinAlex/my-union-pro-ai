#!/usr/bin/env tsx
/**
 * Тестирование синхронизации с персональным токеном
 */

import { PrismaClient } from "@prisma/client";
import { decryptPassword } from "../lib/best-benefits-password";
import { getUserActivatedDiscounts } from "../lib/best-benefits-activation";

const prisma = new PrismaClient();

async function testSync(email: string) {
  try {
    console.log(`🔍 Testing sync for: ${email}`);

    // Get user
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
      console.error(`❌ User not found`);
      process.exit(1);
    }

    console.log(`\n✅ User found:`);
    console.log(`  BB User ID: ${user.bestBenefitsUserId}`);
    console.log(`  Has Password: ${!!user.bestBenefitsPassword}`);

    if (!user.bestBenefitsPassword) {
      console.error(`\n❌ No password saved!`);
      process.exit(1);
    }

    // Decrypt password
    console.log(`\n🔐 Decrypting password...`);
    const password = decryptPassword(user.bestBenefitsPassword);
    console.log(`✅ Password decrypted`);

    // Try sync
    console.log(`\n🔄 Fetching activated discounts...`);
    const discounts = await getUserActivatedDiscounts(
      user.bestBenefitsUserId!,
      password // Personal token!
    );

    console.log(`\n📊 Sync result:`);
    console.log(`  Found ${discounts.length} activated discounts`);
    
    discounts.forEach((d, i) => {
      console.log(`\n  ${i + 1}. ID: ${d.id}`);
      console.log(`     Promo: ${d.promoCode || "none"}`);
    });

    if (discounts.length > 0) {
      console.log(`\n✅ Sync successful!`);
    } else {
      console.log(`\n⚠️  No activated discounts found`);
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error("Usage: pnpm dotenv -e .env.local -- tsx scripts/test-personal-sync.ts <email>");
  process.exit(1);
}

testSync(email);

