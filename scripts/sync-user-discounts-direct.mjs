#!/usr/bin/env node

/**
 * Прямая синхронизация скидок пользователя с BestBenefits
 * Использует Prisma напрямую, обходя API
 * 
 * Usage:
 *   pnpm tsx scripts/sync-user-discounts-direct.mjs cursedx@ya.ru
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { syncDiscountsWithBestBenefits, getValidActivatedDiscounts } from '../lib/discount-activation.ts';
import { decryptPassword } from '../lib/best-benefits-password.ts';
import { fetchBestBenefitsDiscounts } from '../lib/best-benefits.ts';
import { updateDiscountValidity } from '../lib/discount-activation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL?.replace('194.87.49.210', 'localhost') || process.env.DATABASE_URL,
    },
  },
});

async function syncUserDiscounts(email) {
  console.log(`\n🔄 Синхронизация скидок для: ${email}`);

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

    if (!user) {
      console.error(`❌ Пользователь не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);

    if (!user.bestBenefitsUserId) {
      console.error(`❌ BestBenefits User ID не установлен`);
      process.exit(1);
    }

    // Расшифровываем пароль
    let userPassword = undefined;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log(`\n🔐 Пароль расшифрован`);
      } catch (error) {
        console.error(`❌ Ошибка расшифровки пароля:`, error.message);
        process.exit(1);
      }
    } else {
      console.error(`❌ Пароль не сохранен`);
      process.exit(1);
    }

    // Синхронизируем скидки
    console.log(`\n🚀 Синхронизируем скидки с BestBenefits...`);
    const syncResult = await syncDiscountsWithBestBenefits(
      user.id,
      user.bestBenefitsUserId,
      userPassword
    );

    console.log(`\n📊 Результат синхронизации:`);
    console.log(`   Синхронизировано: ${syncResult.synced}`);
    console.log(`   Удалено устаревших: ${syncResult.expired}`);
    if (syncResult.errors.length > 0) {
      console.log(`   Ошибки: ${syncResult.errors.join(', ')}`);
    }

    // Получаем информацию о скидках для обновления сроков действия
    const validActivations = await getValidActivatedDiscounts(user.id);
    
    if (validActivations.length > 0) {
      console.log(`\n🔄 Обновляем сроки действия для ${validActivations.length} скидок...`);
      
      const discountIds = validActivations.map(a => a.discountId);
      
      try {
        const batchSize = 50;
        for (let i = 0; i < discountIds.length; i += batchSize) {
          const batch = discountIds.slice(i, i + batchSize);
          const idsParam = batch.join(",");
          
          const discountsData = await fetchBestBenefitsDiscounts({
            ids: idsParam,
            limit: batchSize,
          });

          for (const discount of discountsData.discounts) {
            if (discount.validUntil) {
              await updateDiscountValidity(
                user.id,
                discount.id,
                discount.validUntil
              );
            }
          }
        }
        console.log(`✅ Сроки действия обновлены`);
      } catch (error) {
        console.warn(`⚠️  Ошибка при обновлении сроков: ${error.message}`);
      }
    }

    // Получаем финальный список
    const finalActivations = await getValidActivatedDiscounts(user.id);

    console.log(`\n✅ Финальный результат:`);
    console.log(`   Всего активированных скидок: ${finalActivations.length}`);
    if (finalActivations.length > 0) {
      finalActivations.forEach((activation, index) => {
        console.log(`   ${index + 1}. ID: ${activation.discountId}, Промокод: ${activation.promoCode || 'нет'}`);
      });
    }

    // Обновляем DiscountPreference для обратной совместимости
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    const existingFilters = (existingPrefs?.filters || {});
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    const claimed = finalActivations.map(a => ({
      id: a.discountId,
      promoCode: a.promoCode,
    }));

    await prisma.discountPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pushEnabled: false,
        filters: {
          claimed,
          favorites: existingFavorites,
        },
      },
      update: {
        filters: {
          claimed,
          favorites: existingFavorites,
        },
      },
    });

    console.log(`\n✅ DiscountPreference обновлен`);

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error('❌ Укажите email:');
  console.error('   pnpm tsx scripts/sync-user-discounts-direct.mjs cursedx@ya.ru');
  process.exit(1);
}

syncUserDiscounts(email);

