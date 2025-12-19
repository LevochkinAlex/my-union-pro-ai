#!/usr/bin/env node

/**
 * Очистка лишних скидок пользователя
 * Удаляет скидки, которых нет в BestBenefits API
 * 
 * Usage:
 *   pnpm tsx scripts/cleanup-user-discounts.mjs cursedx@ya.ru
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { getUserActivatedDiscounts } from '../lib/best-benefits-activation.ts';
import { decryptPassword } from '../lib/best-benefits-password.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function cleanupUserDiscounts(email) {
  console.log(`\n🔍 Очистка лишних скидок для: ${email}`);

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
        console.error(`❌ Ошибка расшифровки пароля:`, error);
        process.exit(1);
      }
    }

    // Получаем активированные скидки из BestBenefits
    console.log(`\n🚀 Запрашиваем активированные скидки из BestBenefits...`);
    const bbActivated = await getUserActivatedDiscounts(
      user.bestBenefitsUserId,
      userPassword,
      {
        timeout: 20000,
        retries: 3,
      }
    );

    console.log(`\n✅ Получено из BestBenefits: ${bbActivated.length} скидок`);
    if (bbActivated.length > 0) {
      bbActivated.forEach((discount, index) => {
        console.log(`   ${index + 1}. ID: ${discount.id}, Промокод: ${discount.promoCode || 'нет'}`);
      });
    }

    // Получаем текущие preferences
    const preference = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    if (!preference) {
      console.log(`\n⚠️  Preferences не найдены, создаем новые`);
      await prisma.discountPreference.create({
        data: {
          userId: user.id,
          pushEnabled: false,
          filters: {
            claimed: bbActivated.map(d => ({
              id: d.id,
              promoCode: d.promoCode || null,
            })),
            favorites: [],
          },
        },
      });
      console.log(`✅ Созданы новые preferences с ${bbActivated.length} скидками`);
      return;
    }

    const filters = (preference.filters || {});
    const existingClaimed = Array.isArray(filters.claimed) ? filters.claimed : [];
    const existingFavorites = Array.isArray(filters.favorites) ? filters.favorites : [];

    console.log(`\n📊 Текущее состояние:`);
    console.log(`   Скидок в БД: ${existingClaimed.length}`);
    console.log(`   Скидок в BestBenefits: ${bbActivated.length}`);

    // Создаем Set ID скидок из BestBenefits
    const bbIdsSet = new Set(bbActivated.map(d => String(d.id)));

    // Фильтруем: оставляем только те скидки, которые есть в BestBenefits
    const validClaimed = existingClaimed.filter((item) => {
      let discountId = null;
      
      if (typeof item === 'object' && item !== null && item.id) {
        discountId = String(item.id);
      } else if (typeof item === 'number') {
        discountId = String(item);
      }

      if (!discountId) {
        return false;
      }

      const isValid = bbIdsSet.has(discountId);
      if (!isValid) {
        console.log(`   ❌ Удаляем лишнюю скидку: ${discountId}`);
      }
      return isValid;
    });

    // Обновляем промокоды из BestBenefits
    const updatedClaimed = bbActivated.map(bbItem => {
      // Ищем существующий элемент
      const existingItem = validClaimed.find((item) => {
        if (typeof item === 'object' && item !== null && item.id) {
          return String(item.id) === String(bbItem.id);
        } else if (typeof item === 'number') {
          return String(item) === String(bbItem.id);
        }
        return false;
      });

      // Используем промокод из BestBenefits, если есть, иначе сохраняем существующий
      let promoCode = bbItem.promoCode || null;
      if (!promoCode && existingItem && typeof existingItem === 'object' && existingItem.promoCode) {
        promoCode = existingItem.promoCode;
      }

      return {
        id: bbItem.id,
        promoCode: promoCode,
      };
    });

    console.log(`\n📊 Результат:`);
    console.log(`   Было скидок: ${existingClaimed.length}`);
    console.log(`   Стало скидок: ${updatedClaimed.length}`);
    console.log(`   Удалено лишних: ${existingClaimed.length - updatedClaimed.length}`);

    // Сохраняем обновленные preferences
    await prisma.discountPreference.update({
      where: { userId: user.id },
      data: {
        filters: {
          claimed: updatedClaimed,
          favorites: existingFavorites,
        },
      },
    });

    console.log(`\n✅ Preferences обновлены!`);
    console.log(`   Оставлено только ${updatedClaimed.length} скидок из BestBenefits`);

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
  console.error('   pnpm tsx scripts/cleanup-user-discounts.mjs cursedx@ya.ru');
  process.exit(1);
}

cleanupUserDiscounts(email);

