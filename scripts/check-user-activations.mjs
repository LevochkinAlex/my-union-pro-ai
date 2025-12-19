#!/usr/bin/env node

/**
 * Проверка активированных скидок пользователя
 * Сравнивает данные из BestBenefits API и нашей БД
 * 
 * Usage:
 *   pnpm tsx scripts/check-user-activations.mjs cursedx@ya.ru
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { getUserActivatedDiscounts } from '../lib/best-benefits-activation.ts';
import { decryptPassword } from '../lib/best-benefits-password.ts';
import { getValidActivatedDiscounts } from '../lib/discount-activation.ts';

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

async function checkUserActivations(email) {
  console.log(`\n🔍 Проверка активированных скидок для: ${email}`);

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

    console.log(`\n✅ Пользователь:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);

    if (!user.bestBenefitsUserId) {
      console.error(`❌ BestBenefits User ID не установлен`);
      process.exit(1);
    }

    // Проверяем DiscountActivation
    const dbActivations = await prisma.discountActivation.findMany({
      where: { userId: user.id },
      orderBy: { activatedAt: 'desc' },
    });

    console.log(`\n📊 Скидки в нашей БД (DiscountActivation):`);
    console.log(`   Всего: ${dbActivations.length}`);
    if (dbActivations.length > 0) {
      dbActivations.forEach((activation, index) => {
        console.log(`   ${index + 1}. ID: ${activation.discountId}, Промокод: ${activation.promoCode || 'нет'}, Синхронизировано: ${activation.syncedFromBB ? 'да' : 'нет'}`);
      });
    }

    // Проверяем DiscountPreference
    const preference = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    const filters = (preference?.filters || {});
    const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];

    console.log(`\n📊 Скидки в DiscountPreference:`);
    console.log(`   Всего: ${claimed.length}`);
    if (claimed.length > 0) {
      claimed.forEach((item, index) => {
        if (typeof item === 'object' && item !== null && item.id) {
          console.log(`   ${index + 1}. ID: ${item.id}, Промокод: ${item.promoCode || 'нет'}`);
        } else {
          console.log(`   ${index + 1}. ID: ${item}`);
        }
      });
    }

    // Проверяем BestBenefits API
    let bbActivated = [];
    try {
      let userPassword = undefined;
      if (user.bestBenefitsPassword) {
        try {
          userPassword = decryptPassword(user.bestBenefitsPassword);
          console.log(`\n🔐 Пароль расшифрован`);
        } catch (error) {
          console.error(`❌ Ошибка расшифровки пароля: ${error.message}`);
        }
      }

      if (userPassword) {
        console.log(`\n🚀 Запрашиваем скидки из BestBenefits API...`);
        bbActivated = await getUserActivatedDiscounts(
          user.bestBenefitsUserId,
          userPassword,
          {
            timeout: 20000,
            retries: 3,
          }
        );

        console.log(`\n📊 Скидки в BestBenefits API:`);
        console.log(`   Всего: ${bbActivated.length}`);
        if (bbActivated.length > 0) {
          bbActivated.forEach((discount, index) => {
            console.log(`   ${index + 1}. ID: ${discount.id}, Промокод: ${discount.promoCode || 'нет'}`);
          });
        }
      } else {
        console.log(`\n⚠️  Пароль не доступен - не можем проверить BestBenefits API`);
      }
    } catch (error) {
      console.error(`\n❌ Ошибка при запросе BestBenefits API:`, error.message);
    }

    // Сравнение
    console.log(`\n📊 Сравнение:`);
    const dbIds = new Set(dbActivations.map(a => a.discountId));
    const bbIds = new Set(bbActivated.map(d => d.id));
    const prefIds = new Set(claimed.map(item => typeof item === 'object' && item !== null ? item.id : item));

    console.log(`   DiscountActivation: ${dbIds.size} скидок`);
    console.log(`   BestBenefits API: ${bbIds.size} скидок`);
    console.log(`   DiscountPreference: ${prefIds.size} скидок`);

    // Находим различия
    const onlyInDB = [...dbIds].filter(id => !bbIds.has(id));
    const onlyInBB = [...bbIds].filter(id => !dbIds.has(id));
    const inBoth = [...dbIds].filter(id => bbIds.has(id));

    if (onlyInDB.length > 0) {
      console.log(`\n⚠️  Скидки только в нашей БД (не в BestBenefits):`);
      onlyInDB.forEach(id => console.log(`   - ID: ${id}`));
    }

    if (onlyInBB.length > 0) {
      console.log(`\n⚠️  Скидки только в BestBenefits (не в нашей БД):`);
      onlyInBB.forEach(id => console.log(`   - ID: ${id}`));
    }

    if (inBoth.length > 0) {
      console.log(`\n✅ Скидки в обоих источниках:`);
      inBoth.forEach(id => console.log(`   - ID: ${id}`));
    }

    if (onlyInDB.length === 0 && onlyInBB.length === 0 && inBoth.length === 0) {
      console.log(`\n✅ Все источники синхронизированы (0 скидок)`);
    }

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
  console.error('   pnpm tsx scripts/check-user-activations.mjs cursedx@ya.ru');
  process.exit(1);
}

checkUserActivations(email);

