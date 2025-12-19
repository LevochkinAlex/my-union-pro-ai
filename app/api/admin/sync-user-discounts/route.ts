import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserActivatedDiscounts } from "@/lib/best-benefits-activation";
import { decryptPassword } from "@/lib/best-benefits-password";

/**
 * Синхронизация скидок конкретного пользователя (только для админов)
 * POST /api/admin/sync-user-discounts
 * Body: { userId?: string, email?: string, phone?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Разрешаем внутренние запросы с секретным ключом
    const internalSecret = request.headers.get("X-Internal-Secret");
    const expectedSecret = process.env.INTERNAL_API_SECRET || "internal-secret-key-change-in-production";
    const isInternalRequest = internalSecret === expectedSecret;
    
    // Если это не внутренний запрос, проверяем сессию
    if (!isInternalRequest) {
      try {
        const session = await getServerSession(authOptions);

        // Check authorization - only admins
        const role = session?.user?.role as string | undefined;
        if (!role || !["SUPER_ADMIN", "ADMIN"].includes(role)) {
          return NextResponse.json(
            { error: "Unauthorized" },
            { status: 403 }
          );
        }
      } catch (authError) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    const { userId, email, phone } = await request.json();

    if (!userId && !email && !phone) {
      return NextResponse.json(
        { error: "userId, email или phone обязательны" },
        { status: 400 }
      );
    }

    // Находим пользователя
    const user = await prisma.user.findFirst({
      where: userId
        ? { id: userId }
        : email
        ? { email: email }
        : { phone: phone },
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
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    console.log(`[admin/sync-user-discounts] Syncing discounts for user: ${user.email || user.phone} (${user.id})`);

    if (!user.bestBenefitsUserId) {
      return NextResponse.json({
        success: false,
        error: "Пользователь ещё не синхронизирован с BestBenefits (отсутствует bestBenefitsUserId)",
      });
    }

    // Расшифровываем пароль
    let userPassword: string | undefined;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log(`[admin/sync-user-discounts] ✅ Using PERSONAL token for user ${user.email}`);
      } catch (error) {
        console.error(`[admin/sync-user-discounts] Failed to decrypt password:`, error);
      }
    } else {
      console.warn(`[admin/sync-user-discounts] ⚠️ No password - using organization token (legacy)`);
    }

    // Получаем активированные скидки из BestBenefits
    const bbActivated = await getUserActivatedDiscounts(
      user.bestBenefitsUserId,
      userPassword,
      {
        timeout: 20000,
        retries: 3,
      }
    );

    console.log(`[admin/sync-user-discounts] ✅ Fetched ${bbActivated.length} activated discounts from BestBenefits`);
    const discountsWithPromoCodes = bbActivated.filter(d => d.promoCode);
    console.log(`[admin/sync-user-discounts] Discounts with promo codes: ${discountsWithPromoCodes.length}`);

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

    // Создаем Map локальных промокодов
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

    console.log(`[admin/sync-user-discounts] ✅ Saved ${updatedClaimed.length} claimed discounts with ${newPromoCodesCount} promo codes`);

    return NextResponse.json({
      success: true,
      message: "Скидки успешно синхронизированы",
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: `${user.firstName} ${user.lastName}`,
      },
      stats: {
        totalDiscounts: updatedClaimed.length,
        discountsWithPromoCodes: newPromoCodesCount,
        promoCodesRestored: newPromoCodesCount > hadPromoCodesCount ? newPromoCodesCount - hadPromoCodesCount : 0,
      },
      discounts: updatedClaimed.map(d => ({
        id: d.id,
        hasPromoCode: !!d.promoCode,
        promoCode: d.promoCode || null,
      })),
    });
  } catch (error) {
    console.error("[admin/sync-user-discounts] Error:", error);
    return NextResponse.json(
      {
        error: "Не удалось синхронизировать скидки",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

