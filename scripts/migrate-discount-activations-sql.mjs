#!/usr/bin/env node

/**
 * Миграция данных из DiscountPreference.filters.claimed в DiscountActivation через SQL
 * Используется когда Prisma не может подключиться напрямую
 * 
 * Usage:
 *   pnpm tsx scripts/migrate-discount-activations-sql.mjs
 */

import { execSync } from 'child_process';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'myunion_user';
const DB_PASS = process.env.DB_PASS || 'MyUnion2024SecurePass!';
const DB_NAME = process.env.DB_NAME || 'myunion_db';

function runSQL(query) {
  try {
    const result = execSync(
      `PGPASSWORD='${DB_PASS}' psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -A -c "${query.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8' }
    );
    return result.trim();
  } catch (error) {
    console.error(`SQL Error: ${error.message}`);
    throw error;
  }
}

async function migrateDiscountActivations() {
  console.log(`\n🔄 Начинаем миграцию данных из DiscountPreference в DiscountActivation...`);

  try {
    // Получаем всех пользователей с активированными скидками
    const usersQuery = `
      SELECT 
        dp."userId",
        u.email,
        dp.filters->'claimed' as claimed
      FROM "DiscountPreference" dp
      JOIN "User" u ON u.id = dp."userId"
      WHERE dp.filters->'claimed' IS NOT NULL 
        AND jsonb_array_length(dp.filters->'claimed') > 0
    `;

    console.log(`\n📊 Получаем список пользователей с активированными скидками...`);
    
    // Используем psql для получения данных
    const usersData = execSync(
      `PGPASSWORD='${DB_PASS}' psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -A -F'|' -c "${usersQuery.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8' }
    );

    const users = usersData.trim().split('\n').filter(line => line.trim()).map(line => {
      const [userId, email, claimedJson] = line.split('|');
      return {
        userId: userId?.trim(),
        email: email?.trim(),
        claimed: claimedJson ? JSON.parse(claimedJson) : []
      };
    });

    console.log(`✅ Найдено ${users.length} пользователей с активированными скидками`);

    let totalMigrated = 0;
    let totalErrors = 0;

    for (const user of users) {
      if (!user.userId || !user.claimed || !Array.isArray(user.claimed)) {
        continue;
      }

      console.log(`\n👤 Пользователь: ${user.email || user.userId}`);
      console.log(`   Найдено ${user.claimed.length} активированных скидок`);

      let migrated = 0;
      let skipped = 0;

      for (const item of user.claimed) {
        let discountId = null;
        let promoCode = null;

        if (typeof item === 'object' && item !== null && item.id) {
          discountId = item.id;
          promoCode = item.promoCode || null;
        } else if (typeof item === 'number') {
          discountId = item;
          promoCode = null;
        } else {
          skipped++;
          continue;
        }

        // Валидируем промокод
        if (promoCode && (
          typeof promoCode !== 'string' ||
          promoCode.trim().length === 0 ||
          promoCode.toLowerCase() === 'null' ||
          promoCode.toLowerCase() === 'undefined'
        )) {
          promoCode = null;
        } else if (promoCode) {
          promoCode = promoCode.trim();
        }

        // Сохраняем в DiscountActivation через SQL
        try {
          const insertQuery = `
            INSERT INTO "DiscountActivation" (
              "id", "userId", "discountId", "promoCode", 
              "activatedAt", "validUntil", "syncedFromBB", "createdAt", "updatedAt"
            )
            VALUES (
              gen_random_uuid()::text,
              '${user.userId.replace(/'/g, "''")}',
              ${discountId},
              ${promoCode ? `'${promoCode.replace(/'/g, "''")}'` : 'NULL'},
              CURRENT_TIMESTAMP,
              NULL,
              false,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
            ON CONFLICT ("userId", "discountId") 
            DO UPDATE SET
              "promoCode" = COALESCE(EXCLUDED."promoCode", "DiscountActivation"."promoCode"),
              "updatedAt" = CURRENT_TIMESTAMP
          `;

          runSQL(insertQuery);
          migrated++;
          console.log(`   ✅ Мигрирована скидка ${discountId}${promoCode ? ` с промокодом ${promoCode}` : ''}`);
        } catch (error) {
          console.error(`   ❌ Ошибка при миграции скидки ${discountId}:`, error.message);
          skipped++;
        }
      }

      totalMigrated += migrated;
      console.log(`   📊 Результат: ${migrated} мигрировано, ${skipped} пропущено`);
    }

    console.log(`\n✅ Миграция завершена!`);
    console.log(`   Всего мигрировано: ${totalMigrated} скидок`);
    console.log(`   Ошибок: ${totalErrors}`);

  } catch (error) {
    console.error(`\n❌ Критическая ошибка:`, error);
    process.exit(1);
  }
}

migrateDiscountActivations();

