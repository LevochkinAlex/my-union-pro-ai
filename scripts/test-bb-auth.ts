#!/usr/bin/env node

/**
 * Скрипт для проверки авторизации в BestBenefits
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { decryptPassword } from '../lib/best-benefits-password';
import { getUserBestBenefitsToken } from '../lib/best-benefits-user-auth';

const prisma = new PrismaClient();

async function testAuth(email: string) {
  console.log(`\n🔐 Проверка авторизации для: ${email}\n`);

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
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);
    console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? '✅ ЕСТЬ' : '❌ НЕТ'}\n`);

    if (!user.bestBenefitsPassword) {
      console.error(`❌ Пароль BestBenefits не установлен`);
      process.exit(1);
    }

    // Расшифровываем пароль
    let password: string;
    try {
      password = decryptPassword(user.bestBenefitsPassword);
      console.log(`🔑 Пароль расшифрован: ${'*'.repeat(password.length)}\n`);
    } catch (error) {
      console.error(`❌ Ошибка расшифровки пароля:`, error);
      process.exit(1);
    }

    // Пытаемся авторизоваться
    console.log(`🔄 Попытка авторизации в BestBenefits...\n`);
    try {
      const token = await getUserBestBenefitsToken(user.bestBenefitsUserId || email, password);
      console.log(`✅ Авторизация успешна!`);
      console.log(`   Токен получен: ${token.substring(0, 20)}...\n`);
      console.log(`💡 Пароль работает! Можно использовать для синхронизации.\n`);
    } catch (error: any) {
      console.error(`❌ Ошибка авторизации: ${error.message}\n`);
      console.log(`💡 Пароль неверный. Нужно изменить пароль в BestBenefits.\n`);
    }

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

const email = process.argv[2] || "talik.e@mail.ru";
testAuth(email);

