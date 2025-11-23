#!/usr/bin/env node

/**
 * Проверяет связь пользователя с BestBenefits
 * Usage: node scripts/check-bb-connection.mjs <email>
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: '.env.local' });

const prisma = new PrismaClient();

async function checkBBConnection(email) {
  try {
    console.log(`🔍 Проверка связи с BestBenefits для: ${email}...`);
    console.log();

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        discountPreference: true,
      }
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`📊 Данные пользователя:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BB User ID: ${user.bestBenefitsUserId || '❌ НЕТ'}`);
    console.log(`   BB Password: ${user.bestBenefitsPassword ? '✅ ЕСТЬ (зашифрован)' : '❌ НЕТ'}`);
    console.log(`   BB Status: ${user.bestBenefitsStatus || '❌ НЕ УСТАНОВЛЕН'}`);
    console.log(`   BB Created At: ${user.bestBenefitsCreatedAt || '❌ НЕТ'}`);
    console.log();

    if (user.discountPreference) {
      const prefs = user.discountPreference.preferences || {};
      console.log(`💳 Локальные предпочтения скидок:`);
      console.log(`   Claimed: ${prefs.claimed?.length || 0} скидок`);
      console.log(`   Favorites: ${prefs.favorites?.length || 0} скидок`);
      console.log(`   Viewed: ${prefs.viewed?.length || 0} скидок`);
    } else {
      console.log(`💳 Локальных предпочтений: ❌ НЕТ`);
    }
    console.log();

    console.log(`📝 Рекомендации:`);
    if (!user.bestBenefitsUserId || !user.bestBenefitsPassword) {
      console.log(`   ⚠️  Пользователь НЕ СВЯЗАН с BestBenefits`);
      console.log(`   💡 Нужно заново зарегистрировать в BB через /api/auth/register`);
      console.log(`   💡 Или восстановить связь если аккаунт существует`);
    } else {
      console.log(`   ✅ Связь с BestBenefits существует`);
      console.log(`   ✅ Скидки должны быть доступны через API`);
    }

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error('❌ Не указан email');
  console.log('Usage: node scripts/check-bb-connection.mjs <email>');
  process.exit(1);
}

checkBBConnection(email);

