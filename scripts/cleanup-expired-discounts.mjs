#!/usr/bin/env node

/**
 * Скрипт для автоматической очистки устаревших скидок
 * Можно запускать по расписанию (cron)
 * 
 * Usage:
 *   pnpm tsx scripts/cleanup-expired-discounts.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cleanupExpiredDiscounts } from '../lib/discount-activation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env.local
dotenv.config({ path: join(__dirname, "..", ".env.local") });

async function cleanup() {
  console.log(`\n🧹 Начинаем очистку устаревших скидок...`);

  try {
    const deletedCount = await cleanupExpiredDiscounts();

    console.log(`\n✅ Очистка завершена!`);
    console.log(`   Удалено устаревших скидок: ${deletedCount}`);

    if (deletedCount > 0) {
      console.log(`\n💡 Рекомендуется запускать этот скрипт ежедневно через cron`);
      console.log(`   Пример: 0 2 * * * cd /opt/my-union-pro && pnpm tsx scripts/cleanup-expired-discounts.mjs`);
    }

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    process.exit(1);
  }
}

cleanup();

