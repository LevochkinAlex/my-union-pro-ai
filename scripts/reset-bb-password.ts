#!/usr/bin/env node

/**
 * Скрипт для сброса пароля BestBenefits
 * 
 * Генерирует новый пароль и обновляет его в нашей БД.
 * Пользователь сможет использовать этот пароль для входа в BestBenefits.
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password.ts talik.e@mail.ru
 * 
 * Или с указанием пароля:
 *   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password.ts talik.e@mail.ru "MyNewPassword123"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../lib/best-benefits-password';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generatePassword(length: number = 12): string {
  // Генерируем пароль с буквами, цифрами и символами
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  
  return password;
}

async function resetBbPassword(email: string, newPassword?: string) {
  console.log(`\n🔍 Сброс пароля BestBenefits для пользователя: ${email}\n`);

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

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || '❌ НЕ СИНХРОНИЗИРОВАН'}`);
    console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? '✅ УСТАНОВЛЕН (зашифрован)' : '❌ НЕ УСТАНОВЛЕН'}\n`);

    if (!user.bestBenefitsUserId) {
      console.error(`❌ Пользователь не синхронизирован с BestBenefits`);
      console.error(`   Сначала нужно синхронизировать пользователя:`);
      console.error(`   pnpm dotenv -e .env.local -- tsx scripts/sync-user-to-bb.ts ${email}`);
      process.exit(1);
    }

    // Генерируем или используем указанный пароль
    const password = newPassword || generatePassword(12);
    
    if (newPassword) {
      console.log(`📝 Используется указанный пароль`);
    } else {
      console.log(`🔑 Сгенерирован новый пароль: ${password}`);
    }

    // Шифруем пароль
    const encryptedPassword = encryptPassword(password);

    // Обновляем пользователя
    await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsPassword: encryptedPassword,
      },
    });

    console.log(`\n✅ Пароль BestBenefits обновлен в нашей БД!`);
    console.log(`   Пароль сохранен в зашифрованном виде\n`);

    console.log(`📋 Инструкции для пользователя:`);
    console.log(`   1. Перейдите на https://bestbenefits.ru/login`);
    console.log(`   2. Нажмите "Забыли пароль?"`);
    console.log(`   3. Введите email: ${user.email}`);
    console.log(`   4. Проверьте почту и следуйте инструкциям`);
    console.log(`   5. Установите новый пароль: ${password}\n`);

    console.log(`💡 Альтернативный способ:`);
    console.log(`   Если восстановление пароля не работает, можно:`);
    console.log(`   1. Обратиться в поддержку BestBenefits`);
    console.log(`   2. Попросить их установить пароль: ${password}`);
    console.log(`   3. Или использовать этот пароль при следующем входе (если аккаунт еще не создан)\n`);

    console.log(`🔗 Данные для входа:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Пароль: ${password}\n`);

    console.log(`⚠️  ВАЖНО:`);
    console.log(`   - Сохраните этот пароль в безопасном месте`);
    console.log(`   - После установки пароля на BestBenefits, синхронизация будет работать`);
    console.log(`   - Промокоды появятся после успешной синхронизации\n`);

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
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password.ts EMAIL [PASSWORD]');
  process.exit(1);
}

resetBbPassword(email, password);

