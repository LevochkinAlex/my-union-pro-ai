#!/usr/bin/env node

/**
 * Скрипт для тестирования отправки SMS и Email
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/test-sms-email.ts sms +79991234567
 *   pnpm dotenv -e .env.local -- tsx scripts/test-sms-email.ts email test@example.com
 */

import 'dotenv/config';
import { sendPINViaSMS } from '../lib/exolve-sms';
import { sendEmailPin } from '../lib/email-pin';

async function testSMS(phone: string) {
  console.log('\n📱 Тестирование отправки SMS...');
  console.log(`   Номер: ${phone}`);
  console.log(`   EXOLVE_API_KEY: ${process.env.EXOLVE_API_KEY ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН'}`);
  
  const testPin = '1234';
  const result = await sendPINViaSMS(phone, testPin);
  
  console.log('\n📊 Результат:');
  console.log(`   Успех: ${result.success ? '✅' : '❌'}`);
  if (result.error) {
    console.log(`   Ошибка: ${result.error}`);
  }
  if (result.messageId) {
    console.log(`   Message ID: ${result.messageId}`);
  }
  if (result.details) {
    console.log(`   Детали:`, result.details);
  }
  
  return result.success;
}

async function testEmail(email: string) {
  console.log('\n📧 Тестирование отправки Email...');
  console.log(`   Email: ${email}`);
  console.log(`   SMTP_HOST: ${process.env.SMTP_HOST || '❌ НЕ УСТАНОВЛЕН'}`);
  console.log(`   SMTP_PORT: ${process.env.SMTP_PORT || '❌ НЕ УСТАНОВЛЕН'}`);
  console.log(`   SMTP_USER: ${process.env.SMTP_USER ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН'}`);
  console.log(`   SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН'}`);
  
  const result = await sendEmailPin(email);
  
  console.log('\n📊 Результат:');
  console.log(`   Успех: ${result.success ? '✅' : '❌'}`);
  if (result.error) {
    console.log(`   Ошибка: ${result.error}`);
  }
  
  return result.success;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('❌ Использование:');
    console.error('   tsx scripts/test-sms-email.ts sms +79991234567');
    console.error('   tsx scripts/test-sms-email.ts email test@example.com');
    process.exit(1);
  }
  
  const type = args[0];
  const target = args[1];
  
  let success = false;
  
  if (type === 'sms') {
    success = await testSMS(target);
  } else if (type === 'email') {
    success = await testEmail(target);
  } else {
    console.error('❌ Неверный тип. Используйте "sms" или "email"');
    process.exit(1);
  }
  
  process.exit(success ? 0 : 1);
}

main().catch(console.error);

