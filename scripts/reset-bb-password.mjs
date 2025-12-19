#!/usr/bin/env node

/**
 * Скрипт для сброса пароля BestBenefits через API
 * 
 * Usage:
 *   pnpm tsx scripts/reset-bb-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M
 * 
 * Процесс:
 * 1. Запрашивает код сброса пароля (отправляется на email)
 * 2. Ждет ввода кода от пользователя
 * 3. Сбрасывает пароль на новый
 * 4. Обновляет bestBenefitsPassword в нашей БД
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';
import { requestPasswordResetCode, resetPassword } from '../lib/best-benefits-password-reset.ts';
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

function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function resetBbPassword(email, newPassword) {
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
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   BestBenefits ID: ${user.bestBenefitsUserId || 'НЕ УСТАНОВЛЕН'}`);

    // Шаг 1: Запрашиваем код сброса пароля
    console.log(`\n📧 Запрашиваем код сброса пароля...`);
    console.log(`   Код будет отправлен на: ${email}`);
    
    const codeRequest = await requestPasswordResetCode(email);
    
    if (codeRequest.status === "error") {
      console.error(`❌ Ошибка при запросе кода: ${codeRequest.message}`);
      if (codeRequest.errors) {
        console.error(`   Детали:`, codeRequest.errors);
      }
      process.exit(1);
    }

    console.log(`✅ Код отправлен на email!`);
    console.log(`   Проверьте почту ${email}`);
    console.log(`   Код действует 15 минут, максимум 5 попыток ввода`);

    // Шаг 2: Запрашиваем код у пользователя
    const code = await askQuestion('\n🔑 Введите 6-значный код из письма: ');

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      console.error(`❌ Неверный формат кода. Код должен состоять из 6 цифр.`);
      process.exit(1);
    }

    // Шаг 3: Сбрасываем пароль
    console.log(`\n🔄 Сбрасываем пароль в BestBenefits...`);
    
    const resetResult = await resetPassword(
      email,
      code,
      newPassword,
      newPassword
    );

    if (resetResult.status === "error") {
      console.error(`❌ Ошибка при сбросе пароля: ${resetResult.message}`);
      if (resetResult.errors) {
        console.error(`   Детали:`, resetResult.errors);
      }
      process.exit(1);
    }

    console.log(`✅ Пароль успешно сброшен в BestBenefits!`);

    // Шаг 4: Обновляем пароль в нашей БД
    console.log(`\n💾 Обновляем пароль в нашей БД...`);
    
    const encryptedPassword = encryptPassword(newPassword);
    
    const updateData = {
      bestBenefitsPassword: encryptedPassword,
    };

    // Если bestBenefitsUserId не установлен, устанавливаем на email
    if (!user.bestBenefitsUserId) {
      updateData.bestBenefitsUserId = user.email;
      updateData.bestBenefitsStatus = 'active';
      console.log(`   Устанавливаем bestBenefitsUserId на email: ${user.email}`);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    console.log(`\n✅ УСПЕХ!`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🔑 Новый пароль BestBenefits: ${newPassword}`);
    console.log(`🔐 Пароль сохранен в БД (зашифрован)`);
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
  console.error('❌ Укажите email и новый пароль:');
  console.error('   pnpm tsx scripts/reset-bb-password.mjs cursedx@ya.ru 8Bh5Zrzjl3M');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ Пароль должен быть не менее 8 символов');
  process.exit(1);
}

resetBbPassword(email, password);

