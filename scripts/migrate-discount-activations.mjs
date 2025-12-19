#!/usr/bin/env node

/**
 * Миграция данных из DiscountPreference.filters.claimed в DiscountActivation
 * 
 * Usage:
 *   pnpm tsx scripts/migrate-discount-activations.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { fetchBestBenefitsDiscounts } from '../lib/best-benefits.ts';

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

async function migrateDiscountActivations() {
  console.log(`\n🔄 Начинаем миграцию данных из DiscountPreference в DiscountActivation...`);

  try {
    // Получаем всех пользователей с preferences
    const preferences = await prisma.discountPreference.findMany({
      where: {
        filters: {
          not: null,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    console.log(`\n📊 Найдено ${preferences.length} пользователей с preferences`);

    let totalMigrated = 0;
    let totalErrors = 0;

    for (const pref of preferences) {
      try {
        const filters = (pref.filters || {});
        const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];

        if (claimed.length === 0) {
          continue;
        }

        console.log(`\n👤 Пользователь: ${pref.user.email || pref.userId}`);
        console.log(`   Найдено ${claimed.length} активированных скидок`);

        let migrated = 0;
        let skipped = 0;

        for (const item of claimed) {
          let discountId = null;
          let promoCode = null;

          if (typeof item === 'object' && item !== null && item.id) {
            discountId = item.id;
            promoCode = item.promoCode || null;
          } else if (typeof item === 'number') {
            discountId = item;
            promoCode = null;
          } else {
            console.warn(`   ⚠️ Пропущен невалидный элемент:`, item);
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

          // Получаем информацию о скидке для validUntil
          let validUntil = null;
          try {
            const discountInfo = await fetchBestBenefitsDiscounts({
              ids: discountId.toString(),
              limit: 1,
            });
            if (discountInfo.discounts.length > 0) {
              validUntil = discountInfo.discounts[0].validUntil || null;
            }
          } catch (error) {
            console.warn(`   ⚠️ Не удалось получить информацию о скидке ${discountId}:`, error.message);
          }

          // Сохраняем в DiscountActivation
          try {
            await prisma.discountActivation.upsert({
              where: {
                userId_discountId: {
                  userId: pref.userId,
                  discountId: discountId,
                },
              },
              create: {
                userId: pref.userId,
                discountId: discountId,
                promoCode: promoCode,
                validUntil: validUntil ? new Date(validUntil) : null,
                activatedAt: new Date(),
                syncedFromBB: false,
              },
              update: {
                // Обновляем промокод, если его не было
                promoCode: promoCode || undefined,
                validUntil: validUntil ? new Date(validUntil) : undefined,
              },
            });
            migrated++;
            console.log(`   ✅ Мигрирована скидка ${discountId}${promoCode ? ` с промокодом ${promoCode}` : ''}`);
          } catch (error) {
            console.error(`   ❌ Ошибка при миграции скидки ${discountId}:`, error.message);
            skipped++;
          }
        }

        totalMigrated += migrated;
        console.log(`   📊 Результат: ${migrated} мигрировано, ${skipped} пропущено`);

      } catch (error) {
        console.error(`\n❌ Ошибка при обработке пользователя ${pref.user.email || pref.userId}:`, error.message);
        totalErrors++;
      }
    }

    console.log(`\n✅ Миграция завершена!`);
    console.log(`   Всего мигрировано: ${totalMigrated} скидок`);
    console.log(`   Ошибок: ${totalErrors}`);

  } catch (error) {
    console.error(`\n❌ Критическая ошибка:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateDiscountActivations();

