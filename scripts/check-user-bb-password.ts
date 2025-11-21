#!/usr/bin/env tsx
/**
 * Проверяет, есть ли у пользователя сохраненный пароль BestBenefits
 */

import { PrismaClient } from "@prisma/client";
import { decryptPassword, isEncrypted } from "../lib/best-benefits-password";

const prisma = new PrismaClient();

async function checkUserPassword(email: string) {
  try {
    console.log(`🔍 Checking user: ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
        bestBenefitsStatus: true,
      },
    });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`\n✅ User found:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.firstName} ${user.lastName}`);
    console.log(`  BB User ID: ${user.bestBenefitsUserId || "NOT SET"}`);
    console.log(`  BB Status: ${user.bestBenefitsStatus || "NOT SET"}`);
    console.log(`  BB Password: ${user.bestBenefitsPassword ? "SET ✅" : "NOT SET ❌"}`);

    if (user.bestBenefitsPassword) {
      console.log(`\n🔐 Password details:`);
      console.log(`  Is encrypted: ${isEncrypted(user.bestBenefitsPassword)}`);
      console.log(`  Length: ${user.bestBenefitsPassword.length} chars`);

      try {
        const decrypted = decryptPassword(user.bestBenefitsPassword);
        console.log(`  ✅ Decryption successful`);
        console.log(`  Decrypted length: ${decrypted.length} chars`);
      } catch (error) {
        console.error(`  ❌ Decryption failed:`, error);
      }
    } else {
      console.log(`\n⚠️  NO PASSWORD SAVED!`);
      console.log(`  This user will use organization token (legacy mode)`);
      console.log(`  Personal activation won't work!`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error("Usage: pnpm dotenv -e .env.local -- tsx scripts/check-user-bb-password.ts <email>");
  process.exit(1);
}

checkUserPassword(email);

