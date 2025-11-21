#!/usr/bin/env node

/**
 * Скрипт для обновления пароля BestBenefits для существующего пользователя
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/update-bb-password.ts ceo@yappix.ru "w+Aj7UH5/FpB"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../lib/best-benefits-password';

const prisma = new PrismaClient();

async function updateBbPassword(email: string, password: string) {
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
      console.error(`❌ Пользователь с email "${email}" не найден в базе данных.`);
      process.exit(1);
    }

    console.log(`\n✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ СИНХРОНИЗИРОВАН'}`);
    console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? 'УСТАНОВЛЕН (зашифрован)' : 'НЕ УСТАНОВЛЕН'}`);

    // Шифруем пароль
    const encryptedPassword = encryptPassword(password);

    // Обновляем пользователя
    await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsPassword: encryptedPassword,
      },
    });

    console.log(`\n✅ Пароль BestBenefits обновлен!`);
    console.log(`   Пароль сохранен в зашифрованном виде`);
    console.log(`\n💡 Теперь при синхронизации с BestBenefits будет использован этот пароль`);
    console.log(`   Пароль: ${password}`);
    console.log(`\n🔗 Для входа на bestbenefits.ru:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Пароль: ${password}`);

  } catch (error: any) {
    console.error(`\n❌ Ошибка: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main
const email = process.argv[2];
const password = process.argv[3];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/update-bb-password.ts EMAIL PASSWORD');
  process.exit(1);
}

if (!password) {
  console.error('❌ Укажите пароль для BestBenefits:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/update-bb-password.ts EMAIL PASSWORD');
  process.exit(1);
}

updateBbPassword(email, password);

