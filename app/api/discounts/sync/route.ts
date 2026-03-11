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
 * Синхронизация активированных скидок с BestBenefits
 * 
 * Обновленная версия с использованием таблицы DiscountActivation:
 * - Сохраняет промокоды в нашу БД (даже если BestBenefits очистит базу)
 * - Проверяет срок действия скидок (validUntil)
 * - Автоматически удаляет устаревшие скидки
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
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!user.bestBenefitsUserId) {
      console.warn("[sync-discounts] User not synced to BestBenefits yet");
      return NextResponse.json({
        success: true,
        message: "Пользователь ещё не синхронизирован с BestBenefits",
        synced: [],
        expired: 0,
      });
    }

    // Decrypt user's BestBenefits password for personal token
    let userPassword: string | undefined;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
      } catch (error) {
        console.error(`[sync-discounts] Failed to decrypt password:`, error);
      }
    }

    // Синхронизируем скидки с BestBenefits
    const syncResult = await syncDiscountsWithBestBenefits(
      user.id,
      user.bestBenefitsUserId,
      userPassword
    );


    // Получаем информацию о скидках для обновления сроков действия
    // Запрашиваем только активированные скидки пользователя
    const validActivations = await getValidActivatedDiscounts(user.id);
    
    if (validActivations.length > 0) {
      
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
        console.error("[sync-discounts] Error updating discount validity:", error);
        // Не критично, продолжаем
      }
    }

    // Получаем финальный список валидных активированных скидок
    const finalActivations = await getValidActivatedDiscounts(user.id);

    // Обновляем DiscountPreference для обратной совместимости
    // (для компонентов, которые еще используют filters.claimed)
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
      message: syncResult.usedFallback 
        ? "Использованы кэшированные данные (API недоступен)"
        : `Синхронизировано ${syncResult.synced} новых, обновлено ${syncResult.updated} скидок`,
      synced: syncResult.synced,
      updated: syncResult.updated,
      expired: syncResult.expired,
      total: finalActivations.length,
      usedFallback: syncResult.usedFallback,
      errors: syncResult.errors.length > 0 ? syncResult.errors : undefined,
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
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
