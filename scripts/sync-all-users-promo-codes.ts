/**
 * Скрипт для массовой синхронизации промокодов всех пользователей с BestBenefits API
 * Восстанавливает промокоды для всех пользователей, у которых есть bestBenefitsUserId
 */

import { prisma } from "../lib/prisma";
import { getUserActivatedDiscounts } from "../lib/best-benefits-activation";
import { decryptPassword } from "../lib/best-benefits-password";

async function syncAllUsersPromoCodes() {
  console.log("🔄 Starting mass sync of promo codes for all users...");

  // Получаем всех пользователей с bestBenefitsUserId
  const users = await prisma.user.findMany({
    where: {
      bestBenefitsUserId: { not: null },
    },
    select: {
      id: true,
      email: true,
      bestBenefitsUserId: true,
      bestBenefitsPassword: true,
    },
  });

  console.log(`📊 Found ${users.length} users with BestBenefits accounts`);

  let successCount = 0;
  let errorCount = 0;
  let totalPromoCodesRestored = 0;

  for (const user of users) {
    try {
      if (!user.bestBenefitsUserId) continue;

      console.log(`\n👤 Processing user: ${user.email} (${user.id})`);

      // Расшифровываем пароль
      let userPassword: string | undefined;
      if (user.bestBenefitsPassword) {
        try {
          userPassword = decryptPassword(user.bestBenefitsPassword);
        } catch (error) {
          console.error(`  ❌ Failed to decrypt password for ${user.email}:`, error);
          errorCount++;
          continue;
        }
      }

      // Получаем активированные скидки из BestBenefits
      const bbActivated = await getUserActivatedDiscounts(
        user.bestBenefitsUserId,
        userPassword,
        {
          timeout: 20000, // 20 секунд для массовой синхронизации
          retries: 3,
        }
      );

      console.log(`  📦 Fetched ${bbActivated.length} activated discounts from BestBenefits`);
      const discountsWithPromoCodes = bbActivated.filter(d => d.promoCode);
      console.log(`  ✅ Found ${discountsWithPromoCodes.length} discounts with promo codes`);

      if (bbActivated.length === 0) {
        console.log(`  ⚠️ No activated discounts found for ${user.email}`);
        continue;
      }

      // Получаем существующие preferences
      const existingPrefs = await prisma.discountPreference.findUnique({
        where: { userId: user.id },
      });

      const existingFilters = (existingPrefs?.filters as any) || {};
      const existingFavorites = Array.isArray(existingFilters.favorites)
        ? existingFilters.favorites
        : [];
      const existingClaimed = Array.isArray(existingFilters.claimed)
        ? existingFilters.claimed
        : [];

      // Создаем Map локальных промокодов для сохранения уже полученных
      const localPromoCodesMap = new Map<string, string>();
      existingClaimed.forEach((item: any) => {
        if (typeof item === 'object' && item !== null && item.id && item.promoCode) {
          const discountId = String(item.id);
          const promoCode = typeof item.promoCode === 'string' 
            ? item.promoCode.trim() 
            : String(item.promoCode).trim();
          if (promoCode && promoCode.length > 0 && promoCode.toLowerCase() !== 'null' && promoCode.toLowerCase() !== 'undefined') {
            localPromoCodesMap.set(discountId, promoCode);
          }
        }
      });

      // Мерджим данные из BestBenefits с локальными
      const updatedClaimed = bbActivated.map(bbItem => {
        let promoCodeFromBB = bbItem.promoCode;
        if (promoCodeFromBB && (promoCodeFromBB.toLowerCase() === 'null' || promoCodeFromBB.toLowerCase() === 'undefined' || promoCodeFromBB.trim() === '')) {
          promoCodeFromBB = null;
        }

        const savedLocalPromoCode = localPromoCodesMap.get(String(bbItem.id));
        const finalPromoCode = promoCodeFromBB || savedLocalPromoCode || null;

        console.log(`  [Sync Script] Discount ${bbItem.id}:`, {
          promoCodeFromBB,
          savedLocalPromoCode,
          finalPromoCode,
          source: promoCodeFromBB ? 'BestBenefits API' : (savedLocalPromoCode ? 'saved local' : 'none'),
        });

        return {
          id: bbItem.id,
          promoCode: finalPromoCode,
        };
      });

      // Добавляем локальные claimed скидки с промокодами, которых нет в BestBenefits
      const bbIdsSet = new Set(bbActivated.map(d => String(d.id)));
      existingClaimed.forEach((item: any) => {
        if (typeof item === 'object' && item !== null && item.id) {
          const discountId = String(item.id);
          const promoCode = item.promoCode 
            ? (typeof item.promoCode === 'string' ? item.promoCode.trim() : String(item.promoCode).trim())
            : null;
          
          if (discountId && !bbIdsSet.has(discountId) && promoCode && promoCode.length > 0 && promoCode.toLowerCase() !== 'null' && promoCode.toLowerCase() !== 'undefined') {
            updatedClaimed.push({
              id: typeof item.id === 'number' ? item.id : parseInt(discountId),
              promoCode: promoCode,
            });
          }
        }
      });

      const newPromoCodesCount = updatedClaimed.filter(d => d.promoCode).length;
      const hadPromoCodesCount = existingClaimed.filter((item: any) => 
        typeof item === 'object' && item?.promoCode
      ).length;

      // Сохраняем preferences
      await prisma.discountPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          pushEnabled: false,
          filters: {
            claimed: updatedClaimed,
            favorites: existingFavorites,
          },
        },
        update: {
          filters: {
            claimed: updatedClaimed,
            favorites: existingFavorites,
          },
        },
      });

      console.log(`  ✅ Saved ${updatedClaimed.length} claimed discounts with ${newPromoCodesCount} promo codes`);
      if (newPromoCodesCount > hadPromoCodesCount) {
        const restored = newPromoCodesCount - hadPromoCodesCount;
        console.log(`  🎉 Restored ${restored} promo codes!`);
        totalPromoCodesRestored += restored;
      }

      successCount++;
    } catch (error) {
      console.error(`  ❌ Error syncing user ${user.email}:`, error);
      errorCount++;
    }

    // Небольшая задержка между пользователями, чтобы не перегружать API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Summary:`);
  console.log(`  ✅ Successfully synced: ${successCount} users`);
  console.log(`  ❌ Errors: ${errorCount} users`);
  console.log(`  🎉 Total promo codes restored: ${totalPromoCodesRestored}`);
  console.log(`\n✨ Mass sync completed!`);
}

// Запускаем скрипт
syncAllUsersPromoCodes()
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });

