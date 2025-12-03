#!/usr/bin/env node

/**
 * Скрипт для сброса пароля BestBenefits с указанным кодом
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password-with-code.ts talik.e@mail.ru "123456" "NewPassword123"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../lib/best-benefits-password';
import { resetPassword } from '../lib/best-benefits-password-reset';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generatePassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  
  return password;
}

async function resetPasswordWithCode(email: string, code: string, newPassword?: string) {
  console.log(`\n🔐 Сброс пароля BestBenefits для: ${email}\n`);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsUserId: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с email "${email}" не найден в базе данных.`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}\n`);

    // Генерируем или используем указанный пароль
    const password = newPassword || generatePassword(12);
    
    if (newPassword) {
      console.log(`📝 Используется указанный пароль`);
    } else {
      console.log(`🔑 Сгенерирован новый пароль: ${password}`);
    }

    console.log(`\n🔄 Установка нового пароля через API...`);
    const resetResult = await resetPassword(email, code, password, password);

    if (resetResult.status !== "success") {
      console.error(`❌ Ошибка при сбросе пароля: ${resetResult.message}`);
      if (resetResult.errors) {
        console.error(`   Ошибки:`, resetResult.errors);
      }
      process.exit(1);
    }

    console.log(`✅ Пароль успешно изменен в BestBenefits!`);
    console.log(`   ${resetResult.message}\n`);

    // Обновляем пароль в нашей БД
    console.log(`💾 Обновление пароля в нашей БД...`);
    const encryptedPassword = encryptPassword(password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsPassword: encryptedPassword,
      },
    });

    console.log(`✅ Пароль обновлен в нашей БД!\n`);

    console.log(`🎉 Готово! Пароль успешно сброшен и синхронизирован.\n`);
    console.log(`📋 Данные для входа:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Пароль: ${password}\n`);

    console.log(`💡 Теперь можно:`);
    console.log(`   1. Войти на https://bestbenefits.ru/login`);
    console.log(`   2. Синхронизировать скидки в нашем приложении`);
    console.log(`   3. Промокоды появятся после синхронизации\n`);

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
const code = process.argv[3];
const password = process.argv[4];

if (!email || !code) {
  console.error('❌ Укажите email и код:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password-with-code.ts EMAIL CODE [PASSWORD]');
  console.error('\nПример:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password-with-code.ts talik.e@mail.ru 123456');
  process.exit(1);
}

resetPasswordWithCode(email, code, password);

