#!/usr/bin/env node

/**
 * Скрипт для запроса кода сброса пароля BestBenefits с детальным логированием
 * 
 * Usage:
 *   pnpm tsx scripts/request-bb-reset-code-debug.mjs cursedx@ya.ru
 */

const API_BASE = "https://bestbenefits.ru/api";

async function requestCode(email) {
  console.log(`\n📧 Запрашиваем код сброса пароля для: ${email}`);
  console.log(`   API: ${API_BASE}/password/forgot`);
  console.log(`   Email: ${email}\n`);

  try {
    const response = await fetch(`${API_BASE}/password/forgot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });

    console.log(`📡 Статус ответа: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log(`📦 Полный ответ API:`, JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error(`\n❌ Ошибка при запросе кода:`);
      console.error(`   Статус: ${response.status}`);
      console.error(`   Сообщение: ${data.message || 'Нет сообщения'}`);
      if (data.errors) {
        console.error(`   Ошибки:`, data.errors);
      }
      process.exit(1);
    }

    console.log(`\n✅ Код успешно отправлен на email!`);
    console.log(`   Статус: ${data.status}`);
    console.log(`   Сообщение: ${data.message || 'Нет сообщения'}`);
    console.log(`\n📬 Проверьте почту ${email}`);
    console.log(`   Также проверьте папку "Спам"`);
    console.log(`   Код действует 15 минут`);
    console.log(`   Максимум 5 попыток ввода`);

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error.message);
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    process.exit(1);
  }
}

const email = process.argv[2];

if (!email) {
  console.error('❌ Укажите email:');
  console.error('   pnpm tsx scripts/request-bb-reset-code-debug.mjs cursedx@ya.ru');
  process.exit(1);
}

requestCode(email);

