import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeActivateDiscount } from "@/lib/best-benefits-activation";
import { decryptPassword } from "@/lib/best-benefits-password";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { discountId, promoCode: requestPromoCode, claimed, favorites } = await request.json();

    if (!discountId || typeof discountId !== "number") {
      return NextResponse.json({ error: "discountId обязателен" }, { status: 400 });
    }

    // Get user data for BestBenefits activation
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

    // Attempt to activate on BestBenefits (if user is synced)
    let bestBenefitsActivated = false;
    let promoCode: string | null = null;
    
    if (user.bestBenefitsUserId) {
      console.log(`[activate-discount] Attempting BestBenefits activation:`, {
        userId: user.id,
        bestBenefitsUserId: user.bestBenefitsUserId,
        discountId,
        email: user.email,
        hasPassword: !!user.bestBenefitsPassword,
      });
      
      // Decrypt user's BestBenefits password for personal token
      let userPassword: string | undefined;
      if (user.bestBenefitsPassword) {
        try {
          userPassword = decryptPassword(user.bestBenefitsPassword);
          console.log(`[activate-discount] ✅ Using PERSONAL token for user ${user.email}`);
        } catch (error) {
          console.error(`[activate-discount] Failed to decrypt password:`, error);
        }
      } else {
        console.warn(`[activate-discount] ⚠️ No password - using organization token (legacy)`);
      }
      
      const activationResult = await safeActivateDiscount({
        userId: user.id,
        bestBenefitsUserId: user.bestBenefitsUserId,
        discountId,
        email: user.email,
        password: userPassword, // Pass decrypted password for personal token
      });
      
      bestBenefitsActivated = activationResult.success === true;
      // Промокод может прийти в ответе активации BestBenefits
      promoCode = activationResult.promoCode || null;
      
      console.log(`[activate-discount] Activation result:`, {
        success: activationResult.success,
        bestBenefitsActivated,
        promoCodeFromBB: promoCode,
        promoCodeFromRequest: requestPromoCode,
      });
      
      // Проверяем, действительно ли скидка активировалась в BestBenefits
      if (bestBenefitsActivated) {
        try {
          const { getUserActivatedDiscounts } = await import("@/lib/best-benefits-activation");
          const activatedDiscounts = await getUserActivatedDiscounts(user.bestBenefitsUserId);
          const isActuallyActivated = activatedDiscounts.some(d => d.id === discountId);
          
          if (!isActuallyActivated) {
            console.warn(`[activate-discount] ⚠️ API вернул успех, но скидка не найдена в активированных`);
            console.warn(`[activate-discount] Возможно, endpoint активации не работает или не существует`);
            bestBenefitsActivated = false;
          } else {
            console.log(`[activate-discount] ✅ Подтверждено: скидка активирована в BestBenefits`);
          }
        } catch (error) {
          console.error(`[activate-discount] Ошибка при проверке активации:`, error);
        }
      }
      
      if (!bestBenefitsActivated) {
        console.warn(`[activate-discount] ⚠️ BestBenefits activation failed for discount ${discountId}`);
        console.warn(`[activate-discount] Скидка будет сохранена локально, но не активирована в BestBenefits`);
      }
    } else {
      console.log(
        `[activate-discount] User ${user.id} not synced to BestBenefits yet, skipping API activation`
      );
    }
    
    // Используем промокод из BestBenefits, если есть, иначе из запроса (из discount)
    if (!promoCode && requestPromoCode && requestPromoCode.trim().length > 0) {
      promoCode = requestPromoCode;
      console.log(`[activate-discount] Using promo code from request (discount):`, promoCode);
    }

    // Get existing preferences to merge
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });

    const existingFilters = (existingPrefs?.filters as any) || {};
    const existingClaimed = Array.isArray(existingFilters.claimed) 
      ? existingFilters.claimed 
      : [];
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    // Merge claimed discounts - update existing or add new
    const updatedClaimed = [...existingClaimed];
    const claimedIndex = updatedClaimed.findIndex((item: any) => {
      return typeof item === 'object' ? item.id === discountId : item === discountId;
    });

    if (claimedIndex !== -1) {
      // Update existing claim with promo code if available
      const existingItem = updatedClaimed[claimedIndex];
      const existingPromoCode = typeof existingItem === 'object' && existingItem.promoCode 
        ? (typeof existingItem.promoCode === 'string' ? existingItem.promoCode.trim() : String(existingItem.promoCode).trim())
        : null;
      
      // Валидируем новый промокод
      const validNewPromoCode = promoCode && 
        typeof promoCode === 'string' && 
        promoCode.trim().length > 0 && 
        promoCode.toLowerCase() !== 'null' && 
        promoCode.toLowerCase() !== 'undefined'
        ? promoCode.trim()
        : null;
      
      // Валидируем существующий промокод
      const validExistingPromoCode = existingPromoCode && 
        existingPromoCode.length > 0 && 
        existingPromoCode.toLowerCase() !== 'null' && 
        existingPromoCode.toLowerCase() !== 'undefined'
        ? existingPromoCode
        : null;
      
      // Приоритет: новый валидный промокод > существующий валидный промокод > null
      const finalPromoCode = validNewPromoCode || validExistingPromoCode || null;
      
      updatedClaimed[claimedIndex] = {
        id: discountId,
        promoCode: finalPromoCode,
      };
      
      console.log(`[activate-discount] Updated existing claim:`, {
        discountId,
        newPromoCode: validNewPromoCode,
        existingPromoCode: validExistingPromoCode,
        finalPromoCode,
        preserved: !validNewPromoCode && !!validExistingPromoCode,
      });
    } else {
      // Add new claim
      // Валидируем промокод перед сохранением
      const validPromoCode = promoCode && 
        typeof promoCode === 'string' && 
        promoCode.trim().length > 0 && 
        promoCode.toLowerCase() !== 'null' && 
        promoCode.toLowerCase() !== 'undefined'
        ? promoCode.trim()
        : null;
      
      updatedClaimed.push({
        id: discountId,
        promoCode: validPromoCode,
      });
      
      console.log(`[activate-discount] Added new claim:`, {
        discountId,
        promoCode: validPromoCode,
        rawPromoCode: promoCode,
      });
    }

    // ВАЖНО: Убеждаемся, что все промокоды валидны перед сохранением
    const validatedClaimed = updatedClaimed.map(item => {
      if (typeof item === 'object' && item.promoCode) {
        const promoCode = typeof item.promoCode === 'string' 
          ? item.promoCode.trim() 
          : String(item.promoCode).trim();
        
        // Валидируем промокод
        if (promoCode.length === 0 || 
            promoCode.toLowerCase() === 'null' || 
            promoCode.toLowerCase() === 'undefined') {
          console.warn(`[activate-discount] ⚠️ Invalid promo code for discount ${item.id}, removing:`, promoCode);
          return {
            id: item.id,
            promoCode: null,
          };
        }
        
        return {
          id: item.id,
          promoCode: promoCode,
        };
      }
      
      return item;
    });

    // Save to local preferences (always do this)
    await prisma.discountPreference.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        pushEnabled: false,
        filters: {
          claimed: validatedClaimed,
          favorites: favorites || existingFavorites,
        },
      },
      update: {
        filters: {
          claimed: validatedClaimed,
          favorites: favorites || existingFavorites,
        },
      },
    });
    
    // Проверяем, что промокоды действительно сохранились
    const savedPrefs = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });
    const savedClaimed = (savedPrefs?.filters as any)?.claimed || [];
    const savedPromoCodesCount = savedClaimed.filter((d: any) => 
      typeof d === 'object' && d.promoCode && 
      d.promoCode.trim().length > 0 && 
      d.promoCode.toLowerCase() !== 'null' && 
      d.promoCode.toLowerCase() !== 'undefined'
    ).length;

    console.log(`[activate-discount] ✅ Saved preferences with promo code:`, {
      discountId,
      promoCode,
      totalClaimed: validatedClaimed.length,
      withPromoCodes: savedPromoCodesCount,
      verified: savedPromoCodesCount > 0,
    });

    return NextResponse.json({
      success: true,
      discountId,
      bestBenefitsActivated,
      promoCode: promoCode, // Добавляем промокод в ответ!
      message: bestBenefitsActivated
        ? "Скидка активирована в BestBenefits"
        : "Скидка сохранена локально",
    });
  } catch (error) {
    console.error("[api/discounts/activate] Error:", error);
    return NextResponse.json(
      { error: "Не удалось активировать скидку" },
      { status: 500 }
    );
  }
}

