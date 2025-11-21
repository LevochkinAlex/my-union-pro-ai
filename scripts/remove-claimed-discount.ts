#!/usr/bin/env tsx
/**
 * Удаляет скидку из локальных preferences пользователя
 * Использование: pnpm dotenv -e .env.local -- tsx scripts/remove-claimed-discount.ts <email> <discountId>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function removeClaimedDiscount(email: string, discountId: number) {
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
      console.log(`⚠️ No discount preferences found`);
      process.exit(0);
    }

    const filters = (user.discountPreference.filters as any) || {};
    const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];

    console.log(`📋 Current claimed discounts:`, claimed);

    // Remove the discount
    const updatedClaimed = claimed.filter((item: any) => {
      const itemId = typeof item === "object" && item.id ? item.id : item;
      return itemId !== discountId;
    });

    console.log(`📋 Updated claimed discounts:`, updatedClaimed);

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

    console.log(`✅ Successfully removed discount ${discountId} from claimed list`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get arguments
const email = process.argv[2];
const discountId = parseInt(process.argv[3]);

if (!email || !discountId) {
  console.error("Usage: pnpm dotenv -e .env.local -- tsx scripts/remove-claimed-discount.ts <email> <discountId>");
  process.exit(1);
}

removeClaimedDiscount(email, discountId);

