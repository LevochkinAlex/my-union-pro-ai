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
    // ✅ Правильный эндпоинт: GET /api/received (согласно документации BB API)
    const response = await fetch(`https://bestbenefits.ru/api/received`, {
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
    
    // Парсим ответ - может быть data.data или просто data
    let activatedProducts: any[] = [];
    if (data.data && Array.isArray(data.data)) {
      activatedProducts = data.data;
    } else if (Array.isArray(data)) {
      activatedProducts = data;
    }
    
    console.log(`[refresh-promo] Got ${activatedProducts.length} activated discounts from BB`);

    // Ищем нужную скидку в ответе
    const discountIdNum = Number(discountId);
    const bbDiscount = activatedProducts.find((d: any) => d.id === discountIdNum);

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
    // Формат /api/received: { codes: [{ code: "ABC123", end_date: "..." }] }
    let freshPromoCode: string | null = null;

    // 1. Проверяем массив codes (основной формат /api/received)
    if (bbDiscount.codes && Array.isArray(bbDiscount.codes) && bbDiscount.codes.length > 0) {
      const now = new Date();
      
      // Ищем первый активный (неистёкший) промокод
      for (const codeObj of bbDiscount.codes) {
        const code = codeObj?.code || codeObj?.promo_code || codeObj?.promoCode;
        const endDate = codeObj?.end_date || codeObj?.endDate;
        
        if (!code || typeof code !== 'string' || code.trim().length === 0) continue;
        if (code === 'Промокод деактивирован' || code.toLowerCase() === 'deactivated') continue;
        
        // Проверяем срок действия
        if (endDate) {
          try {
            const expDate = new Date(endDate);
            if (!isNaN(expDate.getTime()) && expDate.getTime() < now.getTime()) {
              console.log(`[refresh-promo] ⚠️ Code ${code} expired on ${endDate}`);
              continue; // Пропускаем истёкший
            }
          } catch {}
        }
        
        freshPromoCode = code.trim();
        console.log(`[refresh-promo] ✅ Found valid code: ${freshPromoCode}`);
        break;
      }
    }
    
    // 2. Fallback на прямые поля (альтернативные форматы)
    if (!freshPromoCode) {
      if (bbDiscount.promoCode && typeof bbDiscount.promoCode === 'string') {
        freshPromoCode = bbDiscount.promoCode;
      } else if (bbDiscount.promo_code && typeof bbDiscount.promo_code === 'string') {
        freshPromoCode = bbDiscount.promo_code;
      } else if (bbDiscount.code && typeof bbDiscount.code === 'string') {
        freshPromoCode = bbDiscount.code;
      }
    }

    console.log(`[refresh-promo] Fresh promo code: ${freshPromoCode || 'not found'}`);

    // Извлекаем end_date из активного кода для обновления validUntil
    let validUntilDate: Date | null = null;
    if (bbDiscount.codes && Array.isArray(bbDiscount.codes) && bbDiscount.codes.length > 0) {
      const activeCode = bbDiscount.codes.find((c: any) => {
        const code = c?.code || c?.promo_code || c?.promoCode;
        return code && code.trim() === freshPromoCode;
      });
      if (activeCode) {
        const endDate = activeCode?.end_date || activeCode?.endDate || activeCode?.end_date_time;
        if (endDate) {
          try {
            const parsedDate = new Date(endDate);
            if (!isNaN(parsedDate.getTime())) {
              const now = new Date();
              if (parsedDate.getTime() >= now.getTime()) {
                validUntilDate = parsedDate;
                console.log(`[refresh-promo] ✅ Promo code valid until ${validUntilDate.toISOString()}`);
              } else {
                console.log(`[refresh-promo] ⚠️ Promo code expired on ${parsedDate.toISOString()}`);
              }
            }
          } catch (error) {
            console.warn(`[refresh-promo] Failed to parse end_date:`, error);
          }
        }
      }
    }

    // Если нашли новый промокод - обновляем в БД
    if (freshPromoCode && freshPromoCode.trim().length > 0) {
      const trimmedCode = freshPromoCode.trim();
      
      // Проверяем, изменился ли промокод или срок действия
      const existing = await prisma.discountActivation.findUnique({
        where: {
          userId_discountId: {
            userId: user.id,
            discountId: discountIdNum,
          },
        },
        select: { promoCode: true, validUntil: true },
      });

      const promoCodeChanged = existing?.promoCode !== trimmedCode;
      const validUntilChanged = validUntilDate && existing?.validUntil?.getTime() !== validUntilDate.getTime();

      if (promoCodeChanged || validUntilChanged) {
        console.log(`[refresh-promo] 🔄 Updating: promoCode="${existing?.promoCode}" → "${trimmedCode}", validUntil="${existing?.validUntil?.toISOString()}" → "${validUntilDate?.toISOString()}"`);
        
        await prisma.discountActivation.update({
          where: {
            userId_discountId: {
              userId: user.id,
              discountId: discountIdNum,
            },
          },
          data: {
            promoCode: trimmedCode,
            ...(validUntilDate ? { validUntil: validUntilDate } : {}),
            lastSyncedAt: new Date(),
          },
        });
      }

      return NextResponse.json({
        promoCode: trimmedCode,
        source: "api",
        updated: promoCodeChanged || validUntilChanged,
        validUntil: validUntilDate?.toISOString() || null,
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

