#!/usr/bin/env node

/**
 * Скрипт для обновления bestBenefitsUserId для существующего пользователя
 * Используется когда пользователь уже существует в BestBenefits
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateBbUserId(email: string) {
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
      console.error(`❌ Пользователь с email "${email}" не найден в базе данных.`);
      process.exit(1);
    }

    console.log(`\n✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);
    console.log(`   BestBenefits Status: ${user.bestBenefitsStatus || 'N/A'}`);

    // Обновляем bestBenefitsUserId на email
    console.log(`\n🚀 Обновление bestBenefitsUserId...`);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsUserId: user.email,
        bestBenefitsStatus: 'active',
        bestBenefitsCreatedAt: user.bestBenefitsCreatedAt || new Date(),
      },
    });

    console.log(`\n✅ BestBenefits ID обновлен!`);
    console.log(`   BestBenefits User ID: ${updatedUser.bestBenefitsUserId}`);
    console.log(`   Status: ${updatedUser.bestBenefitsStatus}`);
    console.log(`   Created At: ${updatedUser.bestBenefitsCreatedAt}`);
    console.log(`\n💡 Email используется как идентификатор в BestBenefits API`);

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

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/update-bb-user-id.ts EMAIL');
  process.exit(1);
}

updateBbUserId(email);
