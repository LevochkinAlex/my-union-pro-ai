import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptPassword } from "@/lib/best-benefits-password";
import {
  syncDiscountsWithBestBenefits,
  getValidActivatedDiscounts,
  updateDiscountValidity,
} from "@/lib/discount-activation";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";

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

    // Синхронизируем скидки с BestBenefits
    const syncResult = await syncDiscountsWithBestBenefits(
      user.id,
      user.bestBenefitsUserId,
      userPassword
    );

    console.log(`[admin/sync-user-discounts] Sync result:`, syncResult);

    // Получаем информацию о скидках для обновления сроков действия
    const validActivations = await getValidActivatedDiscounts(user.id);
    
    if (validActivations.length > 0) {
      console.log(`[admin/sync-user-discounts] Updating validity for ${validActivations.length} discounts`);
      
      // Получаем информацию о скидках из BestBenefits для обновления validUntil
      const discountIds = validActivations.map(a => a.discountId);
      
      try {
        // Запрашиваем информацию о скидках пакетами
        const batchSize = 50;
        for (let i = 0; i < discountIds.length; i += batchSize) {
          const batch = discountIds.slice(i, i + batchSize);
          const idsParam = batch.join(",");
          
          const discountsData = await fetchBestBenefitsDiscounts({
            ids: idsParam,
            limit: batchSize,
          });

          // Обновляем сроки действия для каждой скидки
          for (const discount of discountsData.discounts) {
            if (discount.validUntil) {
              await updateDiscountValidity(
                user.id,
                discount.id,
                discount.validUntil
              );
            }
          }
        }
      } catch (error) {
        console.error("[admin/sync-user-discounts] Error updating discount validity:", error);
        // Не критично, продолжаем
      }
    }

    // Получаем финальный список валидных активированных скидок
    const finalActivations = await getValidActivatedDiscounts(user.id);

    // Обновляем DiscountPreference для обратной совместимости
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    const existingFilters = (existingPrefs?.filters as any) || {};
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    // Формируем claimed из DiscountActivation
    const claimed = finalActivations.map(a => ({
      id: a.discountId,
      promoCode: a.promoCode,
    }));

    await prisma.discountPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pushEnabled: false,
        filters: {
          claimed,
          favorites: existingFavorites,
        },
      },
      update: {
        filters: {
          claimed,
          favorites: existingFavorites,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Скидки успешно синхронизированы",
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.phone,
      },
      stats: {
        synced: syncResult.synced,
        expired: syncResult.expired,
        total: finalActivations.length,
        withPromoCodes: finalActivations.filter(a => a.promoCode).length,
      },
      errors: syncResult.errors.length > 0 ? syncResult.errors : undefined,
    });
  } catch (error) {
    console.error("[admin/sync-user-discounts] Error:", error);
    return NextResponse.json(
      {
        error: "Не удалось синхронизировать скидки",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
