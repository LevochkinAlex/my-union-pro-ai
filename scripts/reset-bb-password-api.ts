#!/usr/bin/env node

/**
 * Скрипт для автоматического сброса пароля BestBenefits через API
 * 
 * Использует API BestBenefits для сброса пароля:
 * 1. Запрашивает код сброса пароля (отправляется на email)
 * 2. Ждет ввода кода от пользователя
 * 3. Устанавливает новый пароль через API
 * 4. Обновляет пароль в нашей БД
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password-api.ts talik.e@mail.ru
 * 
 * Или с указанием пароля:
 *   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password-api.ts talik.e@mail.ru "MyNewPassword123"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../lib/best-benefits-password';
import { requestPasswordResetCode, resetPassword } from '../lib/best-benefits-password-reset';
import * as readline from 'readline';
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

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function resetBbPasswordViaAPI(email: string, newPassword?: string) {
  console.log(`\n🔐 Сброс пароля BestBenefits через API для: ${email}\n`);

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
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || '❌ НЕ СИНХРОНИЗИРОВАН'}\n`);

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

    console.log(`\n📧 Шаг 1: Запрос кода сброса пароля...`);
    const codeRequest = await requestPasswordResetCode(email);

    if (codeRequest.status !== "success") {
      console.error(`❌ Ошибка при запросе кода: ${codeRequest.message}`);
      if (codeRequest.errors) {
        console.error(`   Ошибки:`, codeRequest.errors);
      }
      process.exit(1);
    }

    console.log(`✅ Код отправлен на email: ${email}`);
    console.log(`   ${codeRequest.message}\n`);

    console.log(`⏳ Шаг 2: Ожидание кода из письма...`);
    console.log(`   Проверьте почту ${email} и найдите письмо с 6-значным кодом`);
    console.log(`   Код действует 15 минут\n`);

    // Запрашиваем код у пользователя
    const code = await askQuestion('Введите 6-значный код из письма: ');

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      console.error(`❌ Неверный формат кода. Код должен состоять из 6 цифр.`);
      process.exit(1);
    }

    console.log(`\n🔄 Шаг 3: Установка нового пароля через API...`);
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
    console.log(`💾 Шаг 4: Обновление пароля в нашей БД...`);
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
const password = process.argv[3];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/reset-bb-password-api.ts EMAIL [PASSWORD]');
  process.exit(1);
}

resetBbPasswordViaAPI(email, password);

