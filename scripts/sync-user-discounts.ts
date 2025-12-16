/**
 * Скрипт для синхронизации скидок конкретного пользователя с BestBenefits API
 * Использование: dotenv -e .env.local -- pnpm tsx scripts/sync-user-discounts.ts <email или phone>
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getUserActivatedDiscounts } from "../lib/best-benefits-activation";
import { decryptPassword } from "../lib/best-benefits-password";

async function syncUserDiscounts(emailOrPhone: string) {
  console.log(`🔄 Starting sync for: ${emailOrPhone}`);

  // Находим пользователя по email или телефону
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: emailOrPhone },
        { phone: emailOrPhone },
      ],
    },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      bestBenefitsUserId: true,
      bestBenefitsPassword: true,
    },
  });

  if (!user) {
    console.error(`❌ User not found: ${emailOrPhone}`);
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email || user.phone} (${user.firstName} ${user.lastName})`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || "NOT SET"}`);

  if (!user.bestBenefitsUserId) {
    console.error(`❌ User is not synced to BestBenefits. bestBenefitsUserId is missing.`);
    process.exit(1);
  }

  // Расшифровываем пароль
  let userPassword: string | undefined;
  if (user.bestBenefitsPassword) {
    try {
      userPassword = decryptPassword(user.bestBenefitsPassword);
      console.log(`✅ Using PERSONAL token for user ${user.email}`);
    } catch (error) {
      console.error(`❌ Failed to decrypt password:`, error);
      console.log(`⚠️ Will try with organization token`);
    }
  } else {
    console.warn(`⚠️ No password - using organization token (legacy)`);
  }

  // Получаем активированные скидки из BestBenefits
  console.log(`\n📦 Fetching activated discounts from BestBenefits...`);
  const bbActivated = await getUserActivatedDiscounts(
    user.bestBenefitsUserId,
    userPassword,
    {
      timeout: 20000,
      retries: 3,
    }
  );

  console.log(`✅ Fetched ${bbActivated.length} activated discounts from BestBenefits`);
  const discountsWithPromoCodes = bbActivated.filter(d => d.promoCode);
  console.log(`   Discounts with promo codes: ${discountsWithPromoCodes.length}`);
  
  if (bbActivated.length > 0) {
    console.log(`\n📋 Discounts from BestBenefits:`);
    bbActivated.forEach(d => {
      console.log(`   - ID: ${d.id}, PromoCode: ${d.promoCode || "N/A"}`);
    });
  }

  if (bbActivated.length === 0) {
    console.log(`⚠️ No activated discounts found for ${user.email}`);
    
    // Показываем текущие локальные данные
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });
    
    const existingFilters = (existingPrefs?.filters as any) || {};
    const existingClaimed = Array.isArray(existingFilters.claimed) 
      ? existingFilters.claimed 
      : [];
    
    if (existingClaimed.length > 0) {
      console.log(`\n📋 Current local claimed discounts (${existingClaimed.length}):`);
      existingClaimed.forEach((item: any) => {
        if (typeof item === 'object' && item.id) {
          console.log(`   - ID: ${item.id}, PromoCode: ${item.promoCode || "N/A"}`);
        } else {
          console.log(`   - ID: ${item}`);
        }
      });
    }
    
    await prisma.$disconnect();
    process.exit(0);
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

  console.log(`\n💾 Found ${localPromoCodesMap.size} saved local promo codes`);

  // Мерджим данные из BestBenefits с локальными
  const updatedClaimed = bbActivated.map(bbItem => {
    let promoCodeFromBB = bbItem.promoCode;
    if (promoCodeFromBB && (promoCodeFromBB.toLowerCase() === 'null' || promoCodeFromBB.toLowerCase() === 'undefined' || promoCodeFromBB.trim() === '')) {
      promoCodeFromBB = null;
    }

    const savedLocalPromoCode = localPromoCodesMap.get(String(bbItem.id));
    const finalPromoCode = promoCodeFromBB || savedLocalPromoCode || null;

    console.log(`   [Sync] Discount ${bbItem.id}:`, {
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
        console.log(`   [Sync] Keeping local discount ${item.id} with promo code ${promoCode}`);
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

  // Проверяем, что промокоды действительно сохранились
  const savedPrefs = await prisma.discountPreference.findUnique({
    where: { userId: user.id },
  });
  const savedClaimed = (savedPrefs?.filters as any)?.claimed || [];
  const savedPromoCodesCount = savedClaimed.filter((d: any) => d.promoCode).length;

  console.log(`\n✅ Saved ${updatedClaimed.length} claimed discounts with ${newPromoCodesCount} promo codes`);
  console.log(`📋 Verified: ${savedPromoCodesCount} promo codes in database`);
  
  if (newPromoCodesCount > hadPromoCodesCount) {
    const restored = newPromoCodesCount - hadPromoCodesCount;
    console.log(`🎉 Restored ${restored} promo codes!`);
  } else if (newPromoCodesCount > 0 && hadPromoCodesCount === 0) {
    console.log(`🎉 Restored ${newPromoCodesCount} promo codes from BestBenefits!`);
  }

  console.log(`\n✨ Sync completed successfully!`);
  
  await prisma.$disconnect();
}

// Получаем аргументы командной строки
const emailOrPhone = process.argv[2];

if (!emailOrPhone) {
  console.error("❌ Usage: pnpm tsx scripts/sync-user-discounts.ts <email или phone>");
  process.exit(1);
}

syncUserDiscounts(emailOrPhone)
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });

