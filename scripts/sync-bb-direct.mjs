#!/usr/bin/env node

/**
 * Прямая синхронизация с BestBenefits без Prisma
 * 
 * Usage:
 *   pnpm tsx scripts/sync-bb-direct.mjs cursedx@ya.ru 8Bh5Zrzjl3M
 */

import 'dotenv/config';
import { createBestBenefitsUser } from '../lib/best-benefits-users.ts';

async function syncDirect(email, password, name) {
  console.log(`\n🚀 Синхронизация с BestBenefits...`);
  console.log(`   Email: ${email}`);
  console.log(`   Name: ${name}`);

  try {
    const result = await createBestBenefitsUser({
      name,
      email,
      password: password,
      city_id: null,
    });

    console.log(`\n✅ УСПЕХ!`);
    console.log(`📧 Email: ${email}`);
    console.log(`🆔 BestBenefits User ID: ${result.data?.id || 'N/A'}`);
    console.log(`📊 Status: ${result.data?.status || result.status || "active"}`);
    console.log(`\n📝 Полный ответ:`, JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(`\n❌ Ошибка синхронизации с BestBenefits:`, error.message);
    console.error(`\n📝 Детали ошибки:`, error);
    process.exit(1);
  }
}

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv[4] || 'Алексей Новиков';

if (!email || !password) {
  console.error('❌ Укажите email и пароль:');
  console.error('   pnpm tsx scripts/sync-bb-direct.mjs cursedx@ya.ru 8Bh5Zrzjl3M "Алексей Новиков"');
  process.exit(1);
}

syncDirect(email, password, name);

