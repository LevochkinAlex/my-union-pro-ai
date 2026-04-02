import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeActivateDiscount } from "@/lib/best-benefits-activation";
import { decryptPassword } from "@/lib/best-benefits-password";
import { saveDiscountActivation, getDiscountPromoCode } from "@/lib/discount-activation";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";
import { isDemoUserId } from "@/lib/demo";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // В демо-режиме скидки не активируются (без записи в БД)
    if (isDemoUserId(session.user.id)) {
      return NextResponse.json({
        success: false,
        demoBlocked: true,
        message: "В демо-режиме активация скидок недоступна. Войдите в аккаунт для активации.",
      });
    }

    const { discountId, parentDiscountId, promoCode: requestPromoCode, claimed, favorites } = await request.json();

    if (!discountId || typeof discountId !== "number") {
      return NextResponse.json({ error: "discountId обязателен" }, { status: 400 });
    }

    // Используем parentDiscountId для сохранения в базе (если это вариант скидки)
    // discountId используется для активации в BestBenefits API
    const discountIdForDb = parentDiscountId || discountId;
    

    // Get user data for BestBenefits activation
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

    // Attempt to activate on BestBenefits (if user is synced)
    let bestBenefitsActivated = false;
    let promoCode: string | null = null;
    let cardBased = false;
    let activationMessage: string | null = null;

    if (user.bestBenefitsUserId) {

      // Decrypt user's BestBenefits password for personal token
      let userPassword: string | undefined;
      if (user.bestBenefitsPassword) {
        try {
          userPassword = decryptPassword(user.bestBenefitsPassword);
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
        password: userPassword,
      });

      bestBenefitsActivated = activationResult.success === true;
      promoCode = activationResult.promoCode || null;
      cardBased = activationResult.cardBased === true;
      activationMessage = activationResult.message || null;

    } else {
      console.warn(`[activate-discount] User ${user.id} not synced to BestBenefits, skipping API activation`);
    }

    // Используем промокод из BestBenefits, если есть, иначе из запроса (из discount)
    if (!promoCode && requestPromoCode && requestPromoCode.trim().length > 0) {
      promoCode = requestPromoCode;
    }

    // Если промокода нет, проверяем, может он уже сохранен в БД
    if (!promoCode) {
      const existingPromoCode = await getDiscountPromoCode(user.id, discountId);
      if (existingPromoCode) {
        promoCode = existingPromoCode;
      }
    }

    // Если BB-активация явно не удалась и кода нет — это ошибка, а не "карточка"
    if (user.bestBenefitsUserId && !bestBenefitsActivated && !promoCode) {
      return NextResponse.json(
        {
          error: "Не удалось получить промокод от BestBenefits",
          details: activationMessage || "BestBenefits не выдал промокод. Попробуйте позже.",
          bestBenefitsActivated: false,
          promoCode: null,
        },
        { status: 502 }
      );
    }

    // Получаем информацию о скидке для validUntil
    // Используем discountIdForDb (родительскую скидку) для получения информации
    let validUntil: string | null = null;
    try {
      const discountInfo = await fetchBestBenefitsDiscounts({
        ids: discountIdForDb.toString(),
        limit: 1,
      });
      if (discountInfo.discounts.length > 0) {
        validUntil = discountInfo.discounts[0].validUntil || null;
      }
    } catch (error) {
      console.warn(`[activate-discount] Failed to fetch discount info for validUntil:`, error);
      // Не критично, продолжаем
    }

    // Сохраняем активацию в DiscountActivation
    // Используем discountIdForDb для сохранения (родительская скидка)
    await saveDiscountActivation(user.id, {
      discountId: discountIdForDb,
      promoCode: promoCode || null,
      validUntil,
      activatedAt: new Date(),
    });


    // Обновляем DiscountPreference для обратной совместимости
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });

    const existingFilters = (existingPrefs?.filters as any) || {};
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    // Полный список избранного приходит только со списка скидок (DiscountsClient).
    // Страница карточки не должна передавать favorites: [] — [] truthy и раньше затирал избранное.
    const mergedFavorites =
      favorites !== undefined && Array.isArray(favorites)
        ? favorites
        : existingFavorites;

    // Получаем все активированные скидки из DiscountActivation
    const { getValidActivatedDiscounts } = await import("@/lib/discount-activation");
    const validActivations = await getValidActivatedDiscounts(user.id);

    const validClaimed = validActivations.map(a => ({
      id: a.discountId,
      promoCode: a.promoCode,
    }));

    const nextFilters = {
      ...existingFilters,
      claimed: validClaimed,
      favorites: mergedFavorites,
    };

    await prisma.discountPreference.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        pushEnabled: false,
        filters: nextFilters,
      },
      update: {
        filters: nextFilters,
      },
    });

    return NextResponse.json({
      success: true,
      discountId: discountIdForDb, // ID родительской скидки
      activatedOptionId: discountId !== discountIdForDb ? discountId : null, // ID активированного варианта
      bestBenefitsActivated,
      promoCode: promoCode,
      cardBased,
      validUntil: validUntil,
      activationMessage,
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
