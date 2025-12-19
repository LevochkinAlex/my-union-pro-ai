#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки активированных скидок пользователя в BestBenefits
 * 
 * Usage:
 *   pnpm tsx scripts/test-bb-user-discounts.mjs cursedx@ya.ru 8Bh5Zrzjl3M
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getUserActivatedDiscounts } from '../lib/best-benefits-activation.ts';
import { decryptPassword } from '../lib/best-benefits-password.ts';
import { PrismaClient } from '@prisma/client';

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

async function testUserDiscounts(email, password) {
  console.log(`\n🔍 Тестируем получение скидок для: ${email}`);

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

    // Используем переданный пароль или расшифровываем из БД
    let userPassword = password;
    if (!userPassword && user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log(`\n🔐 Пароль расшифрован из БД`);
      } catch (error) {
        console.error(`❌ Ошибка расшифровки пароля:`, error);
        process.exit(1);
      }
    }

    if (!userPassword) {
      console.error(`❌ Пароль не указан и не найден в БД`);
      process.exit(1);
    }

    console.log(`\n🚀 Запрашиваем активированные скидки из BestBenefits...`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId}`);
    console.log(`   Используем персональный токен`);

    const bbActivated = await getUserActivatedDiscounts(
      user.bestBenefitsUserId,
      userPassword,
      {
        timeout: 20000,
        retries: 3,
      }
    );

    console.log(`\n✅ Результат:`);
    console.log(`   Получено скидок: ${bbActivated.length}`);

    if (bbActivated.length > 0) {
      console.log(`\n📋 Список активированных скидок:`);
      bbActivated.forEach((discount, index) => {
        console.log(`   ${index + 1}. ID: ${discount.id}, Промокод: ${discount.promoCode || 'нет'}`);
      });
    } else {
      console.log(`\n⚠️  У пользователя нет активированных скидок в BestBenefits`);
    }

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error.message);
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email) {
  console.error('❌ Укажите email:');
  console.error('   pnpm tsx scripts/test-bb-user-discounts.mjs cursedx@ya.ru 8Bh5Zrzjl3M');
  process.exit(1);
}

testUserDiscounts(email, password);

