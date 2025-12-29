#!/usr/bin/env node

/**
 * Скрипт для тестирования интеграции Google Wallet
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/test-google-wallet.ts
 */

import 'dotenv/config';
import { createDiscountPass, createLoyaltyClass } from '../lib/google-pay-passes';

async function testGoogleWallet() {
  console.log('\n🧪 Тестирование интеграции Google Wallet...\n');

  // Проверка переменных окружения
  console.log('📋 Проверка переменных окружения:');
  const issuerId = process.env.GOOGLE_PAY_ISSUER_ID;
  const serviceAccountEmail = process.env.GOOGLE_PAY_SERVICE_ACCOUNT_EMAIL || 
    'firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com';
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  console.log(`   GOOGLE_PAY_ISSUER_ID: ${issuerId ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН'}`);
  console.log(`   SERVICE_ACCOUNT_EMAIL: ${serviceAccountEmail ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН'}`);
  console.log(`   FIREBASE_PRIVATE_KEY: ${privateKey ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН'}`);

  if (!issuerId) {
    console.error('\n❌ GOOGLE_PAY_ISSUER_ID не установлен в .env.local');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('\n❌ FIREBASE_PRIVATE_KEY не установлен в .env.local');
    process.exit(1);
  }

  console.log(`\n   Issuer ID: ${issuerId}`);
  console.log(`   Service Account: ${serviceAccountEmail}\n`);

  // Тест 1: Создание класса пропуска
  console.log('🧪 Тест 1: Создание Loyalty Class...');
  try {
    await createLoyaltyClass({
      classId: 'test_discount_class',
      issuerName: 'MyUnion Pro',
      programName: 'Тестовая программа скидок',
    });
    console.log('✅ Loyalty Class создан успешно\n');
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.message?.includes('409')) {
      console.log('✅ Loyalty Class уже существует (это нормально)\n');
    } else {
      console.error('❌ Ошибка создания Loyalty Class:', error.message);
      console.error('   Детали:', error);
      process.exit(1);
    }
  }

  // Тест 2: Создание полного пропуска
  console.log('🧪 Тест 2: Создание полного Discount Pass...');
  try {
    const result = await createDiscountPass(
      9999, // Тестовый ID скидки
      'Тестовая скидка',
      'test-user-123',
      'Тестовый Пользователь',
      'TEST123',
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // +1 год
      undefined // без изображения для теста
    );

    console.log('✅ Discount Pass создан успешно');
    console.log(`   Save URL: ${result.saveUrl}`);
    console.log(`   JWT: ${result.jwt.substring(0, 50)}...`);
    console.log('\n✅ Все тесты пройдены успешно!');
    console.log('\n💡 Для проверки в браузере:');
    console.log(`   Откройте: ${result.saveUrl}`);
    console.log('   (На Android устройстве это должно открыть Google Wallet)');
  } catch (error: any) {
    console.error('\n❌ Ошибка создания Discount Pass:', error.message);
    if (error.message?.includes('401') || error.message?.includes('403')) {
      console.error('\n⚠️  Проблема с аутентификацией:');
      console.error('   1. Проверьте, что Service Account имеет права на Google Pay API');
      console.error('   2. Убедитесь, что Google Pay Passes API включен в Google Cloud Console');
      console.error('   3. Проверьте, что FIREBASE_PRIVATE_KEY правильно скопирован (с \\n)');
    } else if (error.message?.includes('404')) {
      console.error('\n⚠️  API не найден:');
      console.error('   1. Убедитесь, что Google Pay Passes API включен в Google Cloud Console');
      console.error('   2. Проверьте, что используется правильный Issuer ID');
    } else {
      console.error('\n   Детали ошибки:', error);
    }
    process.exit(1);
  }
}

testGoogleWallet().catch((error) => {
  console.error('\n❌ Критическая ошибка:', error);
  process.exit(1);
});

