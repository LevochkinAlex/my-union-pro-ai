import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserActivatedDiscounts } from "@/lib/best-benefits-activation";
import { decryptPassword } from "@/lib/best-benefits-password";

/**
 * Синхронизация активированных скидок с BestBenefits
 * Проверяет, какие скидки пользователь активировал напрямую на сайте BestBenefits
 * и обновляет локальные preferences
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Get user with BestBenefits ID and password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true, // Need password for personal token
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!user.bestBenefitsUserId) {
      console.log("[sync-discounts] User not synced to BestBenefits yet");
      return NextResponse.json({
        success: true,
        message: "Пользователь ещё не синхронизирован с BestBenefits",
        synced: [],
      });
    }

    // Decrypt user's BestBenefits password for personal token
    let userPassword: string | undefined;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log(`[sync-discounts] ✅ Using PERSONAL token for user ${user.email}`);
      } catch (error) {
        console.error(`[sync-discounts] Failed to decrypt password:`, error);
      }
    } else {
      console.warn(`[sync-discounts] ⚠️ No password - using organization token (legacy)`);
    }

    // Fetch activated discounts from BestBenefits using personal token
    // ВАЖНО: НЕ используем fallback на локальные данные - только данные из BestBenefits API
    // Это гарантирует, что промокоды всегда актуальны и валидны
    const bbActivated = await getUserActivatedDiscounts(
      user.bestBenefitsUserId, 
      userPassword,
      {
        timeout: 15000, // 15 секунд
        retries: 2,
      }
    );

    console.log("[sync-discounts] ✅ Fetched activated discounts from BestBenefits:", {
      count: bbActivated.length,
      discounts: bbActivated.map(d => ({ id: d.id, hasPromoCode: !!d.promoCode, promoCode: d.promoCode })),
    });

    // Get existing preferences для сохранения favorites
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    const existingFilters = (existingPrefs?.filters as any) || {};
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    if (bbActivated.length === 0) {
      // Если нет активированных скидок в BestBenefits, очищаем claimed но сохраняем favorites
      await prisma.discountPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          pushEnabled: false,
          filters: {
            claimed: [],
            favorites: existingFavorites,
          },
        },
        update: {
          filters: {
            claimed: [],
            favorites: existingFavorites,
          },
        },
      });

      console.log("[sync-discounts] No activated discounts found on BestBenefits - cleared local claimed discounts");
      return NextResponse.json({
        success: true,
        message: "Нет активированных скидок на BestBenefits. Локальные данные очищены.",
        synced: [],
        cleared: true,
      });
    }

    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    // МЕРДЖИМ данные из BestBenefits с локальными preferences
    // Важно: если в BestBenefits API нет промокода, но он есть локально - сохраняем локальный
    // Создаем Map локальных промокодов для быстрого поиска
    const localPromoCodesMap = new Map<string, string>();
    existingClaimed.forEach((item: any) => {
      let discountId: string | null = null;
      let promoCode: string | null = null;
      
      if (typeof item === 'object' && item !== null && item.id) {
        discountId = String(item.id);
        promoCode = item.promoCode 
          ? (typeof item.promoCode === 'string' ? item.promoCode.trim() : String(item.promoCode).trim())
          : null;
      } else if (typeof item === 'number') {
        discountId = String(item);
      }
      
      if (discountId && promoCode && promoCode.length > 0 && promoCode.toLowerCase() !== 'null' && promoCode.toLowerCase() !== 'undefined') {
        localPromoCodesMap.set(discountId, promoCode);
        console.log(`[sync-discounts] Found local promo code for discount ${discountId}:`, promoCode);
      }
    });
    
    // Мерджим: приоритет у промокодов из BestBenefits API, но если их нет - используем локальные
    const updatedClaimed = bbActivated.map(bbItem => {
      // Нормализуем промокод из BestBenefits: строки "null", "undefined" и пустые значения превращаем в null
      let promoCodeFromBB = bbItem.promoCode;
      if (promoCodeFromBB && (promoCodeFromBB.toLowerCase() === 'null' || promoCodeFromBB.toLowerCase() === 'undefined' || promoCodeFromBB.trim() === '')) {
        console.log(`[sync-discounts] ⚠️ Invalid promo code from BestBenefits for discount ${bbItem.id}, normalizing to null:`, promoCodeFromBB);
        promoCodeFromBB = null;
      }
      
      // Пробуем найти локальный промокод, если BestBenefits не вернул
      const localPromoCode = localPromoCodesMap.get(String(bbItem.id));
      
      // Приоритет: BestBenefits > локальный
      const finalPromoCode = promoCodeFromBB || localPromoCode || null;
      
      const result = {
        id: bbItem.id,
        promoCode: finalPromoCode,
      };
      
      console.log(`[sync-discounts] Processing discount ${bbItem.id}:`, {
        id: result.id,
        promoCodeFromBB: promoCodeFromBB,
        localPromoCode: localPromoCode,
        finalPromoCode: result.promoCode,
        hasPromoCode: !!result.promoCode,
      });
      
      return result;
    });
    
    // Добавляем локальные claimed скидки, которых нет в BestBenefits (если они были сохранены локально)
    // Это важно, если пользователь активировал скидку до синхронизации с BestBenefits
    const bbIdsSet = new Set(bbActivated.map(d => String(d.id)));
    existingClaimed.forEach((item: any) => {
      let discountId: string | null = null;
      
      if (typeof item === 'object' && item !== null && item.id) {
        discountId = String(item.id);
      } else if (typeof item === 'number') {
        discountId = String(item);
      }
      
      // Если скидка есть локально, но нет в BestBenefits - добавляем её (но только если она действительно claimed)
      if (discountId && !bbIdsSet.has(discountId)) {
        const localPromoCode = localPromoCodesMap.get(discountId);
        const id = typeof item === 'object' ? item.id : item;
        updatedClaimed.push({
          id: id,
          promoCode: localPromoCode || null,
        });
        console.log(`[sync-discounts] Keeping local discount ${discountId} (not found in BestBenefits):`, {
          id,
          promoCode: localPromoCode,
        });
      }
    });

    console.log("[sync-discounts] ✅ Prepared updated claimed discounts:", {
      count: updatedClaimed.length,
      discountsWithPromoCodes: updatedClaimed.filter(d => d.promoCode).length,
      discounts: updatedClaimed.map(d => ({ id: d.id, promoCode: d.promoCode })),
    });

    // Save merged preferences
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

    // Проверяем что промокоды действительно сохранились
    const savedPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });
    const savedClaimed = (savedPrefs?.filters as any)?.claimed || [];
    
    console.log("[sync-discounts] ✅ Synced discounts and saved to database:", {
      userId: user.id,
      bbActivated: bbActivated.length,
      totalClaimed: updatedClaimed.length,
      savedClaimed: savedClaimed.length,
      discountsWithPromoCodes: updatedClaimed.filter(d => d.promoCode).length,
      savedDiscountsWithPromoCodes: savedClaimed.filter((d: any) => d.promoCode).length,
      savedDiscounts: savedClaimed.map((d: any) => ({ 
        id: d.id, 
        promoCode: d.promoCode,
        type: typeof d,
      })),
    });

    return NextResponse.json({
      success: true,
      message: `Синхронизировано ${bbActivated.length} скидок с BestBenefits`,
      synced: bbActivated.map(d => d.id),
      totalClaimed: updatedClaimed.length,
    });
  } catch (error) {
    console.error("[sync-discounts] ❌ Error:", error);
    if (error instanceof Error) {
      console.error("[sync-discounts] Error message:", error.message);
      console.error("[sync-discounts] Error stack:", error.stack);
    }
    return NextResponse.json(
      { 
        error: "Не удалось синхронизировать скидки",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

