#!/usr/bin/env node

/**
 * Простой скрипт для запроса кода сброса пароля BestBenefits
 * Не требует подключения к БД
 * 
 * Usage:
 *   pnpm tsx scripts/request-bb-reset-code.mjs cursedx@ya.ru
 */

import { requestPasswordResetCode } from '../lib/best-benefits-password-reset.ts';

async function requestCode(email) {
  console.log(`\n📧 Запрашиваем код сброса пароля для: ${email}`);
  console.log(`   Код будет отправлен на email: ${email}`);
  console.log(`   Код действует 15 минут, максимум 5 попыток ввода\n`);

  try {
    const result = await requestPasswordResetCode(email);
    
    if (result.status === "error") {
      console.error(`❌ Ошибка: ${result.message}`);
      if (result.errors) {
        console.error(`   Детали:`, result.errors);
      }
      process.exit(1);
    }

    console.log(`✅ Код успешно отправлен на email!`);
    console.log(`\n📬 Проверьте почту ${email}`);
    console.log(`   Код действует 15 минут`);
    console.log(`   Максимум 5 попыток ввода`);
    console.log(`\n💡 После получения кода используйте скрипт:`);
    console.log(`   pnpm tsx scripts/reset-bb-password.mjs ${email} 8Bh5Zrzjl3M`);
    console.log(`   Или API endpoint с параметром code`);

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error.message);
    process.exit(1);
  }
}

const email = process.argv[2];

if (!email) {
  console.error('❌ Укажите email:');
  console.error('   pnpm tsx scripts/request-bb-reset-code.mjs cursedx@ya.ru');
  process.exit(1);
}

requestCode(email);

