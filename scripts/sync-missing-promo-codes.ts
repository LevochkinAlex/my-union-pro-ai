#!/usr/bin/env node

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../lib/best-benefits-password';
import { getUserBestBenefitsToken } from '../lib/best-benefits-user-auth';
import { getUserActivatedDiscounts } from '../lib/best-benefits-activation';

const prisma = new PrismaClient();

async function syncMissingPromoCodes(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user || !user.bestBenefitsPassword || !user.bestBenefitsUserId) {
      console.log('❌ User not found or not synced with BestBenefits');
      return;
    }

    console.log(`\n👤 User: ${user.email}\n`);

    const password = decryptPassword(user.bestBenefitsPassword);
    const token = await getUserBestBenefitsToken(user.bestBenefitsUserId, password);

    // Получаем активированные скидки из BestBenefits
    const bbActivated = await getUserActivatedDiscounts(user.bestBenefitsUserId, password);
    console.log(`📋 Found ${bbActivated.length} activated discounts in BestBenefits\n`);

    // Получаем локальные preferences
    const preference = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    if (!preference) {
      console.log('❌ No discount preferences found');
      return;
    }

    const filters = (preference.filters as any) || {};
    const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];

    // Создаем мапу промокодов из BestBenefits
    const bbPromoCodesMap = new Map<number, string>();
    bbActivated.forEach(item => {
      if (item.promoCode) {
        bbPromoCodesMap.set(item.id, item.promoCode);
      }
    });

    // Обновляем локальные промокоды
    const updatedClaimed = claimed.map((item: any) => {
      const discountId = typeof item === 'object' ? item.id : item;
      const currentPromoCode = typeof item === 'object' ? item.promoCode : null;
      
      // Если промокода нет, но есть в BestBenefits - используем его
      if (!currentPromoCode && bbPromoCodesMap.has(discountId)) {
        const bbPromoCode = bbPromoCodesMap.get(discountId)!;
        console.log(`  ✅ Updating discount ${discountId}: ${bbPromoCode}`);
        return { id: discountId, promoCode: bbPromoCode };
      }
      
      // Если промокод уже есть, оставляем его
      if (currentPromoCode) {
        return { id: discountId, promoCode: currentPromoCode };
      }
      
      // Если промокода нет нигде, оставляем как есть
      return { id: discountId, promoCode: null };
    });

    // Сохраняем обновленные preferences
    await prisma.discountPreference.update({
      where: { userId: user.id },
      data: {
        filters: {
          ...filters,
          claimed: updatedClaimed,
        },
      },
    });

    console.log(`\n✅ Updated ${updatedClaimed.length} discounts\n`);

    // Показываем итоговую статистику
    const withPromoCode = updatedClaimed.filter((item: any) => item.promoCode).length;
    const withoutPromoCode = updatedClaimed.length - withPromoCode;
    
    console.log(`📊 Statistics:`);
    console.log(`   With promo code: ${withPromoCode}`);
    console.log(`   Without promo code: ${withoutPromoCode}\n`);

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || 'talik.e@mail.ru';
syncMissingPromoCodes(email);

