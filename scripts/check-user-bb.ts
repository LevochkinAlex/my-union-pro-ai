#!/usr/bin/env node

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../lib/best-benefits-password';

const prisma = new PrismaClient();

async function checkUser(email: string) {
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
      bestBenefitsCreatedAt: true,
    },
  });

  if (!user) {
    console.error(`❌ Пользователь не найден`);
    process.exit(1);
  }

  console.log('\n📊 Данные пользователя:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
  console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);
  console.log(`   BestBenefits Status: ${user.bestBenefitsStatus || 'N/A'}`);
  console.log(`   BestBenefits Created At: ${user.bestBenefitsCreatedAt || 'N/A'}`);
  console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? '✅ УСТАНОВЛЕН' : '❌ НЕ УСТАНОВЛЕН'}`);
  
  if (user.bestBenefitsPassword) {
    try {
      const password = decryptPassword(user.bestBenefitsPassword);
      console.log(`   Расшифрованный пароль: ${password}`);
    } catch (error) {
      console.log(`   ⚠️ Ошибка расшифровки пароля`);
    }
  }

  await prisma.$disconnect();
}

const email = process.argv[2];
if (!email) {
  console.error('❌ Укажите email: pnpm dotenv -e .env.local -- tsx scripts/check-user-bb.ts EMAIL');
  process.exit(1);
}

checkUser(email);

