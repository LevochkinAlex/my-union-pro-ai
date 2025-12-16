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

    // Get existing preferences для сохранения favorites и уже полученных промокодов
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
      
      // Сохраняем только валидные промокоды
      if (discountId && promoCode && promoCode.length > 0 && promoCode.toLowerCase() !== 'null' && promoCode.toLowerCase() !== 'undefined') {
        localPromoCodesMap.set(discountId, promoCode);
        console.log(`[sync-discounts] Found saved local promo code for discount ${discountId}:`, promoCode);
      }
    });
    
    // Мерджим: приоритет у промокодов из BestBenefits API, но если их нет - используем уже сохраненные локальные
    const updatedClaimed = bbActivated.map(bbItem => {
      // Нормализуем промокод из BestBenefits: строки "null", "undefined" и пустые значения превращаем в null
      let promoCodeFromBB = bbItem.promoCode;
      if (promoCodeFromBB && (promoCodeFromBB.toLowerCase() === 'null' || promoCodeFromBB.toLowerCase() === 'undefined' || promoCodeFromBB.trim() === '')) {
        console.log(`[sync-discounts] ⚠️ Invalid promo code from BestBenefits for discount ${bbItem.id}, normalizing to null:`, promoCodeFromBB);
        promoCodeFromBB = null;
      }
      
      // Пробуем найти уже сохраненный локальный промокод, если BestBenefits не вернул
      // Это безопасно, т.к. промокоды не меняются после получения
      const savedLocalPromoCode = localPromoCodesMap.get(String(bbItem.id));
      
      // Приоритет: BestBenefits > уже сохраненный локальный
      const finalPromoCode = promoCodeFromBB || savedLocalPromoCode || null;
      
      const result = {
        id: bbItem.id,
        promoCode: finalPromoCode,
      };
      
      console.log(`[sync-discounts] Processing discount ${bbItem.id}:`, {
        id: result.id,
        promoCodeFromBB: promoCodeFromBB,
        savedLocalPromoCode: savedLocalPromoCode,
        finalPromoCode: result.promoCode,
        hasPromoCode: !!result.promoCode,
        source: promoCodeFromBB ? 'BestBenefits API' : (savedLocalPromoCode ? 'saved local' : 'none'),
      });
      
      return result;
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

