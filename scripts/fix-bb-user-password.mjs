#!/usr/bin/env node

/**
 * Исправление пароля BestBenefits для существующего пользователя
 * Сохраняет пароль в bestBenefitsPassword и обновляет bestBenefitsUserId
 * 
 * Usage:
 *   pnpm tsx scripts/fix-bb-user-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../lib/best-benefits-password.ts';

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

async function fixBbPassword(email, password) {
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
        bestBenefitsStatus: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);
    console.log(`   BestBenefits Status: ${user.bestBenefitsStatus || 'N/A'}`);
    console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? 'УСТАНОВЛЕН' : 'НЕ УСТАНОВЛЕН'}`);

    // Шифруем пароль
    console.log(`\n🔐 Шифруем пароль для BestBenefits...`);
    const encryptedPassword = encryptPassword(password);

    // Обновляем пользователя
    const updateData = {
      bestBenefitsPassword: encryptedPassword,
    };

    // Если bestBenefitsUserId не установлен, устанавливаем на email
    if (!user.bestBenefitsUserId) {
      updateData.bestBenefitsUserId = user.email;
      updateData.bestBenefitsStatus = 'active';
      console.log(`\n📝 Устанавливаем bestBenefitsUserId на email: ${user.email}`);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    console.log(`\n✅ УСПЕХ!`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🔑 Пароль BestBenefits сохранен (зашифрован)`);
    console.log(`🆔 BestBenefits User ID: ${updateData.bestBenefitsUserId || user.bestBenefitsUserId}`);
    console.log(`\n💡 Теперь можно синхронизировать скидки через /api/discounts/sync`);

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('❌ Укажите email и пароль:');
  console.error('   pnpm tsx scripts/fix-bb-user-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M');
  process.exit(1);
}

fixBbPassword(email, password);

