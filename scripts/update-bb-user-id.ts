#!/usr/bin/env node

/**
 * Скрипт для обновления bestBenefitsUserId для существующих пользователей
 * 
 * Usage:
 *   pnpm tsx scripts/update-bb-user-id.ts ceo@yappix.ru
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateUserBBId(email: string) {
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
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);
    console.log(`   BestBenefits Status: ${user.bestBenefitsStatus || 'N/A'}`);

    if (!user.firstName || !user.lastName) {
      console.warn(`\n⚠️  У пользователя не заполнены firstName/lastName`);
      console.warn(`   Пользователь должен заполнить профиль через приложение`);
      console.warn(`   После заполнения профиля он автоматически синхронизируется с BestBenefits`);
      process.exit(0);
    }

    // Обновляем bestBenefitsUserId на email
    console.log(`\n🚀 Обновление bestBenefitsUserId...`);
    
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsUserId: user.email,
        bestBenefitsStatus: 'success',
        bestBenefitsCreatedAt: new Date(),
      },
    });

    console.log(`\n✅ Пользователь обновлен!`);
    console.log(`   BestBenefits User ID: ${updatedUser.bestBenefitsUserId}`);
    console.log(`   Status: ${updatedUser.bestBenefitsStatus}`);
    console.log(`   Created At: ${updatedUser.bestBenefitsCreatedAt}`);

    console.log(`\n💡 Теперь пользователь может активировать скидки!`);
    console.log(`   Email используется как идентификатор в BestBenefits API`);

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main
const email = process.argv[2];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm tsx scripts/update-bb-user-id.ts ceo@yappix.ru');
  process.exit(1);
}

updateUserBBId(email);

