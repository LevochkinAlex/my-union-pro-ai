#!/usr/bin/env node
/**
 * Скрипт миграции данных скидок пользователей
 * 
 * Задачи:
 * 1. Перенести избранные скидки из DiscountPreference.filters.favorites в DiscountFavorite
 * 2. Синхронизировать claimed из DiscountPreference с DiscountActivation
 * 3. Запустить полную синхронизацию скидок с BestBenefits
 * 
 * Запуск: node scripts/migrate-discounts-data.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateUserFavorites() {
  console.log("\n📋 Migrating user favorites...");
  
  const preferences = await prisma.discountPreference.findMany({
    where: {
      filters: { not: null }
    },
    include: {
      user: { select: { id: true, email: true } }
    }
  });
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const pref of preferences) {
    const filters = pref.filters;
    if (!filters || typeof filters !== 'object') continue;
    
    const favorites = filters.favorites;
    if (!Array.isArray(favorites) || favorites.length === 0) continue;
    
    console.log(`  Processing user ${pref.user?.email || pref.userId}...`);
    
    for (const item of favorites) {
      const discountId = typeof item === 'object' ? item.id : item;
      if (!discountId || typeof discountId !== 'number') continue;
      
      try {
        // Проверяем, существует ли уже избранное
        const existing = await prisma.discountFavorite.findUnique({
          where: {
            userId_discountId: {
              userId: pref.userId,
              discountId
            }
          }
        });
        
        if (existing) {
          skipped++;
          continue;
        }
        
        // Проверяем, существует ли скидка в локальной базе
        const discount = await prisma.discount.findUnique({
          where: { id: discountId }
        });
        
        if (!discount) {
          console.log(`    ⚠️ Discount ${discountId} not found in local DB, will be created after sync`);
          // Пока пропускаем - после синхронизации можно повторить миграцию
          skipped++;
          continue;
        }
        
        // Создаём запись избранного
        await prisma.discountFavorite.create({
          data: {
            userId: pref.userId,
            discountId
          }
        });
        migrated++;
      } catch (error) {
        console.error(`    ❌ Error migrating favorite ${discountId} for user ${pref.userId}:`, error.message);
        errors++;
      }
    }
  }
  
  console.log(`  ✅ Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`);
  return { migrated, skipped, errors };
}

async function syncClaimedDiscounts() {
  console.log("\n📋 Syncing claimed discounts...");
  
  const preferences = await prisma.discountPreference.findMany({
    where: {
      filters: { not: null }
    },
    include: {
      user: { select: { id: true, email: true } }
    }
  });
  
  let synced = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const pref of preferences) {
    const filters = pref.filters;
    if (!filters || typeof filters !== 'object') continue;
    
    const claimed = filters.claimed;
    if (!Array.isArray(claimed) || claimed.length === 0) continue;
    
    console.log(`  Processing user ${pref.user?.email || pref.userId}...`);
    
    for (const item of claimed) {
      let discountId;
      let promoCode = null;
      
      if (typeof item === 'object' && item.id) {
        discountId = item.id;
        promoCode = item.promoCode || null;
      } else if (typeof item === 'number') {
        discountId = item;
      } else {
        continue;
      }
      
      try {
        // Проверяем, существует ли уже активация
        const existing = await prisma.discountActivation.findUnique({
          where: {
            userId_discountId: {
              userId: pref.userId,
              discountId
            }
          }
        });
        
        if (existing) {
          // Обновляем промокод, если он появился
          if (!existing.promoCode && promoCode) {
            await prisma.discountActivation.update({
              where: { id: existing.id },
              data: { promoCode }
            });
            console.log(`    📝 Updated promo code for discount ${discountId}`);
          }
          skipped++;
          continue;
        }
        
        // Создаём запись активации
        await prisma.discountActivation.create({
          data: {
            userId: pref.userId,
            discountId,
            promoCode,
            syncedFromBB: false // Из preferences, не из BB
          }
        });
        synced++;
      } catch (error) {
        console.error(`    ❌ Error syncing claimed ${discountId} for user ${pref.userId}:`, error.message);
        errors++;
      }
    }
  }
  
  console.log(`  ✅ Synced: ${synced}, Skipped: ${skipped}, Errors: ${errors}`);
  return { synced, skipped, errors };
}

async function getStats() {
  const [
    totalUsers,
    preferencesCount,
    favoritesCount,
    activationsCount,
    discountsCount,
    categoriesCount
  ] = await Promise.all([
    prisma.user.count(),
    prisma.discountPreference.count(),
    prisma.discountFavorite.count(),
    prisma.discountActivation.count(),
    prisma.discount.count(),
    prisma.discountCategory.count()
  ]);
  
  return {
    totalUsers,
    preferencesCount,
    favoritesCount,
    activationsCount,
    discountsCount,
    categoriesCount
  };
}

async function main() {
  console.log("🚀 Starting discount data migration...\n");
  
  // Статистика до миграции
  console.log("📊 Stats before migration:");
  const statsBefore = await getStats();
  console.log(statsBefore);
  
  // Синхронизируем claimed из preferences в activations
  await syncClaimedDiscounts();
  
  // Мигрируем избранное (после синхронизации скидок)
  // await migrateUserFavorites();
  
  // Статистика после миграции
  console.log("\n📊 Stats after migration:");
  const statsAfter = await getStats();
  console.log(statsAfter);
  
  console.log("\n✨ Migration completed!");
  console.log("\n⚠️ Note: Run the full sync from admin panel to populate Discount table,");
  console.log("   then run this script again to migrate favorites.");
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

