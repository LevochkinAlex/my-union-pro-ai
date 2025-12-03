#!/usr/bin/env node

/**
 * Универсальный скрипт для исправления пароля BestBenefits
 * 
 * Пытается:
 * 1. Пересоздать пользователя с новым паролем (если пользователь не существует)
 * 2. Или сбросить пароль через API (если пользователь существует)
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/fix-bb-user-password.ts talik.e@mail.ru
 * 
 * Или с указанием пароля:
 *   pnpm dotenv -e .env.local -- tsx scripts/fix-bb-user-password.ts talik.e@mail.ru "MyNewPassword123"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encryptPassword } from '../lib/best-benefits-password';
import { createBestBenefitsUser } from '../lib/best-benefits-users';
import { requestPasswordResetCode, resetPassword } from '../lib/best-benefits-password-reset';
import * as readline from 'readline';
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

async function fixBbUserPassword(email: string, newPassword?: string) {
  console.log(`\n🔧 Исправление пароля BestBenefits для: ${email}\n`);

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

    if (!user.firstName || !user.lastName) {
      console.error(`❌ У пользователя не заполнены ФИО`);
      console.error(`   BestBenefits требует имя и фамилию для создания пользователя`);
      process.exit(1);
    }

    // Генерируем или используем указанный пароль
    const password = newPassword || generatePassword(12);
    
    if (newPassword) {
      console.log(`📝 Используется указанный пароль`);
    } else {
      console.log(`🔑 Сгенерирован новый пароль: ${password}`);
    }

    // Сначала пытаемся пересоздать пользователя
    console.log(`\n🔄 Попытка 1: Пересоздание пользователя в BestBenefits...`);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

    try {
      const createResult = await createBestBenefitsUser({
        name,
        email: user.email,
        password: password,
        city_id: null,
      });

      console.log(`✅ Пользователь успешно создан/обновлен в BestBenefits!`);
      console.log(`   Status: ${createResult.status}`);
      console.log(`   Message: ${createResult.message}\n`);

      // Обновляем данные в БД
      const encryptedPassword = encryptPassword(password);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: user.email,
          bestBenefitsStatus: createResult.status || "success",
          bestBenefitsCreatedAt: new Date(),
          bestBenefitsPassword: encryptedPassword,
        },
      });

      console.log(`✅ Пароль обновлен в нашей БД!\n`);
      console.log(`🎉 Готово! Пользователь создан/обновлен с новым паролем.\n`);
      console.log(`📋 Данные для входа:`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Пароль: ${password}\n`);

      return;
    } catch (createError: any) {
      console.log(`⚠️  Пересоздание не удалось: ${createError.message}`);
      
      // Проверяем, что ошибка связана с существующим пользователем
      const errorMessage = createError.message || '';
      const errorString = JSON.stringify(createError);
      const isUserExists = 
        errorMessage.includes('уже существует') || 
        errorMessage.includes('422') ||
        errorMessage.includes('Ошибка валидации') ||
        errorString.includes('уже существует') ||
        errorString.includes('E-Mail адрес уже существует');
      
      // Если пользователь уже существует, пытаемся сбросить пароль через API
      if (isUserExists) {
        console.log(`\n🔄 Попытка 2: Сброс пароля через API...\n`);
        
        // Запрашиваем код сброса
        console.log(`📧 Запрос кода сброса пароля...`);
        const codeRequest = await requestPasswordResetCode(email);

        if (codeRequest.status !== "success") {
          console.error(`❌ Ошибка при запросе кода: ${codeRequest.message}`);
          console.error(`\n💡 Возможные решения:`);
          console.error(`   1. Пользователь не существует в BestBenefits - используйте пересоздание`);
          console.error(`   2. Обратитесь в поддержку BestBenefits`);
          console.error(`   3. Проверьте, что email правильный\n`);
          process.exit(1);
        }

        console.log(`✅ Код отправлен на email: ${email}`);
        console.log(`   ${codeRequest.message}\n`);

        // Запрашиваем код у пользователя
        const code = await askQuestion('Введите 6-значный код из письма: ');

        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
          console.error(`❌ Неверный формат кода. Код должен состоять из 6 цифр.`);
          process.exit(1);
        }

        // Сбрасываем пароль
        console.log(`\n🔄 Установка нового пароля...`);
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
      } else {
        throw createError;
      }
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

// Main
const email = process.argv[2];
const password = process.argv[3];

if (!email) {
  console.error('❌ Укажите email пользователя:');
  console.error('   pnpm dotenv -e .env.local -- tsx scripts/fix-bb-user-password.ts EMAIL [PASSWORD]');
  process.exit(1);
}

fixBbUserPassword(email, password);

