#!/usr/bin/env node

/**
 * Скрипт для синхронизации пользователя с BestBenefits
 * 
 * Usage:
 *   pnpm tsx scripts/sync-user-to-bb.mjs ceo@yappix.ru
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createBestBenefitsUser } from '../lib/best-benefits-users.ts';

const prisma = new PrismaClient();

async function syncUser(email) {
  console.log(`\n🔍 Ищем пользователя: ${email}`);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        password: true,
        bestBenefitsUserId: true,
        bestBenefitsStatus: true,
        bestBenefitsCreatedAt: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден в базе данных`);
      process.exit(1);
    }

    console.log(`\n✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ СИНХРОНИЗИРОВАН'}`);
    console.log(`   BestBenefits Status: ${user.bestBenefitsStatus || 'N/A'}`);

    if (user.bestBenefitsUserId) {
      console.log(`\n⚠️  Пользователь уже синхронизирован с BestBenefits`);
      console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId}`);
      console.log(`   Дата синхронизации: ${user.bestBenefitsCreatedAt || 'N/A'}`);
      
      const answer = await askQuestion('\nПересоздать пользователя в BestBenefits? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Отменено');
        process.exit(0);
      }
    }

    if (!user.password) {
      console.error(`\n❌ У пользователя нет пароля в базе данных`);
      console.error(`   Невозможно создать пользователя в BestBenefits без пароля`);
      process.exit(1);
    }

    console.log(`\n🚀 Синхронизация с BestBenefits...`);
    
    // Generate full name
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: user.password, // Это хешированный пароль, может не подойти
        city_id: null,
      });

      console.log(`\n✅ Пользователь успешно синхронизирован!`);
      console.log(`   BestBenefits User ID: ${result.data?.id}`);
      console.log(`   Status: ${result.data?.status}`);
      console.log(`   Response:`, result);

      // Update user in database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: result.data?.id?.toString(),
          bestBenefitsStatus: result.data?.status || result.status,
          bestBenefitsCreatedAt: new Date(),
        },
      });

      console.log(`\n💾 Данные сохранены в базе данных`);
      
    } catch (error) {
      console.error(`\n❌ Ошибка синхронизации:`, error.message);
      
      if (error.message.includes('401')) {
        console.error(`\n🔑 Проблема с авторизацией в BestBenefits API`);
        console.error(`   Проверьте BB_PROFSOYUZY_TOKEN в .env.local`);
      } else if (error.message.includes('400')) {
        console.error(`\n⚠️  Возможные причины:`);
        console.error(`   - Пользователь уже существует в BestBenefits`);
        console.error(`   - Неверный формат данных`);
        console.error(`   - Нужен незашифрованный пароль`);
      }
      
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer);
    });
  });
}

// Main
const email = process.argv[2];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm tsx scripts/sync-user-to-bb.mjs ceo@yappix.ru');
  process.exit(1);
}

syncUser(email);

