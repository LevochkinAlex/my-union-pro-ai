import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptPassword } from "@/lib/best-benefits-password";
import { getUserBestBenefitsToken } from "@/lib/best-benefits-user-auth";

/**
 * Получить СВЕЖИЙ промокод для активированной скидки
 * 
 * Некоторые скидки (Вкусвилл и др.) генерируют НОВЫЙ промокод при каждом запросе.
 * Этот эндпоинт запрашивает промокод напрямую из BestBenefits API и обновляет кэш.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { discountId } = body;

    if (!discountId) {
      return NextResponse.json({ error: "discountId обязателен" }, { status: 400 });
    }

    // Получаем пользователя с данными BestBenefits
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user?.bestBenefitsUserId || !user?.bestBenefitsPassword) {
      return NextResponse.json({
        error: "Не синхронизирован с BestBenefits",
        promoCode: null,
      }, { status: 200 });
    }

    // Расшифровываем пароль
    let password: string;
    try {
      password = decryptPassword(user.bestBenefitsPassword);
    } catch (error) {
      console.error("[refresh-promo] Failed to decrypt password:", error);
      return NextResponse.json({
        error: "Ошибка расшифровки пароля",
        promoCode: null,
      }, { status: 200 });
    }

    // Получаем персональный токен
    let userToken: string;
    try {
      userToken = await getUserBestBenefitsToken(user.bestBenefitsUserId, password);
    } catch (error) {
      console.error("[refresh-promo] Failed to get user token:", error);
      return NextResponse.json({
        error: "Ошибка получения токена",
        promoCode: null,
      }, { status: 200 });
    }

    console.log(`[refresh-promo] Fetching fresh promo code for discount ${discountId}...`);

    // Запрашиваем СВЕЖИЙ промокод из BestBenefits
    // Используем эндпоинт активированных скидок
    const response = await fetch(`https://bestbenefits.ru/api/users/${user.bestBenefitsUserId}/products`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${userToken}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`[refresh-promo] BestBenefits API error: ${response.status}`);
      // Возвращаем промокод из кэша
      const cached = await prisma.discountActivation.findUnique({
        where: {
          userId_discountId: {
            userId: user.id,
            discountId: Number(discountId),
          },
        },
        select: { promoCode: true },
      });
      
      return NextResponse.json({
        promoCode: cached?.promoCode || null,
        source: "cache",
        warning: "API недоступен, используется кэш",
      });
    }

    const data = await response.json();
    console.log(`[refresh-promo] Got ${data.data?.length || 0} activated discounts from BB`);

    // Ищем нужную скидку в ответе
    const discountIdNum = Number(discountId);
    const bbDiscount = data.data?.find((d: any) => d.id === discountIdNum);

    if (!bbDiscount) {
      console.log(`[refresh-promo] Discount ${discountId} not found in activated list`);
      
      // Возвращаем промокод из кэша
      const cached = await prisma.discountActivation.findUnique({
        where: {
          userId_discountId: {
            userId: user.id,
            discountId: discountIdNum,
          },
        },
        select: { promoCode: true },
      });
      
      return NextResponse.json({
        promoCode: cached?.promoCode || null,
        source: "cache",
        warning: "Скидка не найдена в активированных",
      });
    }

    // Извлекаем промокод из ответа
    let freshPromoCode: string | null = null;

    // Пробуем разные варианты структуры ответа
    if (bbDiscount.promoCode && typeof bbDiscount.promoCode === 'string') {
      freshPromoCode = bbDiscount.promoCode;
    } else if (bbDiscount.promo_code && typeof bbDiscount.promo_code === 'string') {
      freshPromoCode = bbDiscount.promo_code;
    } else if (bbDiscount.code && typeof bbDiscount.code === 'string') {
      freshPromoCode = bbDiscount.code;
    } else if (bbDiscount.promocode && typeof bbDiscount.promocode === 'string') {
      freshPromoCode = bbDiscount.promocode;
    }

    console.log(`[refresh-promo] Fresh promo code: ${freshPromoCode || 'not found'}`);

    // Если нашли новый промокод - обновляем в БД
    if (freshPromoCode && freshPromoCode.trim().length > 0) {
      const trimmedCode = freshPromoCode.trim();
      
      // Проверяем, изменился ли промокод
      const existing = await prisma.discountActivation.findUnique({
        where: {
          userId_discountId: {
            userId: user.id,
            discountId: discountIdNum,
          },
        },
        select: { promoCode: true },
      });

      if (existing?.promoCode !== trimmedCode) {
        console.log(`[refresh-promo] 🔄 Promo code changed: "${existing?.promoCode}" → "${trimmedCode}"`);
        
        await prisma.discountActivation.update({
          where: {
            userId_discountId: {
              userId: user.id,
              discountId: discountIdNum,
            },
          },
          data: {
            promoCode: trimmedCode,
            lastSyncedAt: new Date(),
          },
        });
      }

      return NextResponse.json({
        promoCode: trimmedCode,
        source: "api",
        updated: existing?.promoCode !== trimmedCode,
      });
    }

    // Промокод не найден в API - возвращаем из кэша
    const cached = await prisma.discountActivation.findUnique({
      where: {
        userId_discountId: {
          userId: user.id,
          discountId: discountIdNum,
        },
      },
      select: { promoCode: true },
    });

    return NextResponse.json({
      promoCode: cached?.promoCode || null,
      source: "cache",
      warning: "Промокод не найден в API",
    });

  } catch (error) {
    console.error("[refresh-promo] Error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Ошибка получения промокода",
      promoCode: null,
    }, { status: 500 });
  }
}

