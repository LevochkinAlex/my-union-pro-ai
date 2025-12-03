#!/usr/bin/env node

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserPromoCodes(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
      },
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`\n👤 User: ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || 'Not set'}\n`);

    const preference = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    if (!preference) {
      console.log('❌ No discount preferences found');
      return;
    }

    const filters = (preference.filters as any) || {};
    const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];

    console.log(`📋 Found ${claimed.length} claimed discounts:\n`);

    for (const item of claimed) {
      const discountId = typeof item === 'object' ? item.id : item;
      const promoCode = typeof item === 'object' ? item.promoCode : null;

      // Получаем информацию о скидке
      const discountResponse = await fetch(`http://localhost:3004/api/discounts/${discountId}`);
      const discountData = await discountResponse.json().catch(() => null);

      console.log(`  📦 Discount ID: ${discountId}`);
      if (discountData?.discount) {
        console.log(`     Title: ${discountData.discount.title}`);
      }
      console.log(`     Promo Code: ${promoCode || '❌ Not set'}`);
      
      if (promoCode) {
        const isSpecialCase = promoCode === "Штрихкод в купоне" ||
          promoCode.toLowerCase().includes("штрихкод") ||
          promoCode.toLowerCase().includes("barcode");
        
        if (isSpecialCase) {
          console.log(`     Type: ⚠️ Special case (barcode)`);
        } else {
          console.log(`     Type: ✅ Regular promo code`);
        }
      }
      console.log('');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'talik.e@mail.ru';
checkUserPromoCodes(email);

