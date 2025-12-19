#!/usr/bin/env node

/**
 * Скрипт для синхронизации скидок пользователя с BestBenefits
 * 
 * Usage:
 *   pnpm tsx scripts/sync-user-discounts.mjs cursedx@ya.ru
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

async function syncDiscounts(email) {
  console.log(`\n🔍 Ищем пользователя: ${email}`);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);

    if (!user.bestBenefitsUserId) {
      console.error(`❌ Пользователь не синхронизирован с BestBenefits`);
      console.error(`   Установите bestBenefitsUserId перед синхронизацией`);
      process.exit(1);
    }

    // Расшифровываем пароль
    let userPassword;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log(`\n🔐 Пароль BestBenefits расшифрован`);
      } catch (error) {
        console.error(`❌ Ошибка расшифровки пароля:`, error);
        process.exit(1);
      }
    } else {
      console.warn(`⚠️  Пароль BestBenefits не установлен, используем организационный токен`);
    }

    // Получаем активированные скидки из BestBenefits
    console.log(`\n🚀 Синхронизация скидок с BestBenefits...`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId}`);
    
    const bbActivated = await getUserActivatedDiscounts(
      user.bestBenefitsUserId,
      userPassword,
      {
        timeout: 20000,
        retries: 3,
      }
    );

    console.log(`\n✅ Получено ${bbActivated.length} активированных скидок из BestBenefits`);
    const discountsWithPromoCodes = bbActivated.filter(d => d.promoCode);
    console.log(`   Скидок с промокодами: ${discountsWithPromoCodes.length}`);

    if (bbActivated.length > 0) {
      console.log(`\n📋 Список активированных скидок:`);
      bbActivated.forEach((discount, index) => {
        console.log(`   ${index + 1}. ID: ${discount.id}, Промокод: ${discount.promoCode || 'нет'}`);
      });
    }

    // Получаем существующие preferences
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    const existingFilters = (existingPrefs?.filters) || {};
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];
    const existingClaimed = Array.isArray(existingFilters.claimed) 
      ? existingFilters.claimed 
      : [];

    // Сохраняем локальные промокоды
    const localPromoCodesMap = new Map();
    existingClaimed.forEach((item) => {
      let discountId = null;
      let promoCode = null;
      
      if (typeof item === 'object' && item !== null && item.id) {
        discountId = String(item.id);
        promoCode = item.promoCode 
          ? (typeof item.promoCode === 'string' ? item.promoCode.trim() : String(item.promoCode).trim())
          : null;
      } else if (typeof item === 'number') {
        discountId = String(item);
      }
      
      if (discountId && promoCode && promoCode.length > 0 && promoCode.toLowerCase() !== 'null' && promoCode.toLowerCase() !== 'undefined') {
        localPromoCodesMap.set(discountId, promoCode);
      }
    });

    // Мерджим: приоритет у промокодов из BestBenefits API
    const updatedClaimed = bbActivated.map(bbItem => {
      const promoCode = bbItem.promoCode 
        ? (bbItem.promoCode.trim().toLowerCase() === 'null' || bbItem.promoCode.trim().toLowerCase() === 'undefined' || bbItem.promoCode.trim() === '' 
          ? localPromoCodesMap.get(String(bbItem.id)) || null
          : bbItem.promoCode.trim())
        : localPromoCodesMap.get(String(bbItem.id)) || null;

      return {
        id: bbItem.id,
        ...(promoCode ? { promoCode } : {}),
      };
    });

    // Добавляем локальные скидки, которых нет в BestBenefits
    existingClaimed.forEach((item) => {
      const discountId = typeof item === 'object' && item !== null && item.id 
        ? String(item.id) 
        : typeof item === 'number' 
        ? String(item) 
        : null;
      
      if (discountId && !bbActivated.find(d => String(d.id) === discountId)) {
        updatedClaimed.push(item);
      }
    });

    // Обновляем preferences
    const updatedFilters = {
      ...existingFilters,
      favorites: existingFavorites,
      claimed: updatedClaimed,
    };

    await prisma.discountPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        filters: updatedFilters,
      },
      update: {
        filters: updatedFilters,
      },
    });

    console.log(`\n✅ Синхронизация завершена!`);
    console.log(`   Обновлено скидок: ${updatedClaimed.length}`);
    const withPromoCodes = updatedClaimed.filter((c) => c.promoCode);
    console.log(`   С промокодами: ${withPromoCodes.length}`);

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
  console.error('   pnpm tsx scripts/sync-user-discounts.mjs cursedx@ya.ru');
  process.exit(1);
}

syncDiscounts(email);

