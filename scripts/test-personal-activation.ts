#!/usr/bin/env tsx
/**
 * Тестирование активации с персональным токеном
 */

import { PrismaClient } from "@prisma/client";
import { decryptPassword } from "../lib/best-benefits-password";
import { activateBestBenefitsDiscount } from "../lib/best-benefits-activation";

const prisma = new PrismaClient();

async function testActivation(email: string, discountId: number) {
  try {
    console.log(`🔍 Testing activation for: ${email}`);
    console.log(`📦 Discount ID: ${discountId}`);

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
      console.error(`\n❌ No password saved - can't use personal token!`);
      process.exit(1);
    }

    // Decrypt password
    console.log(`\n🔐 Decrypting password...`);
    const password = decryptPassword(user.bestBenefitsPassword);
    console.log(`✅ Password decrypted (length: ${password.length})`);

    // Try activation
    console.log(`\n🔄 Activating discount ${discountId}...`);
    const result = await activateBestBenefitsDiscount({
      userId: user.id,
      bestBenefitsUserId: user.bestBenefitsUserId!,
      discountId,
      email: user.email,
      password, // Personal token!
    });

    console.log(`\n📊 Activation result:`);
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log(`\n✅ SUCCESS!`);
      console.log(`Promo code: ${result.promoCode}`);
    } else {
      console.log(`\n❌ FAILED!`);
      console.log(`Message: ${result.message}`);
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
const discountId = parseInt(process.argv[3]);

if (!email || !discountId) {
  console.error("Usage: pnpm dotenv -e .env.local -- tsx scripts/test-personal-activation.ts <email> <discountId>");
  process.exit(1);
}

testActivation(email, discountId);

