import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";
import type { DiscountSearchParams } from "@/types/discounts";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const params = buildSearchParams(request);
    await enrichParamsWithPreference(params, session.user.id);
    const payload = await fetchBestBenefitsDiscounts(params);

    // Обогащаем скидки промокодами из сохраненных preferences
    const preferences = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });

    if (preferences && payload.discounts) {
      const filters = (preferences.filters as any) || {};
      const claimed = Array.isArray(filters.claimed) ? filters.claimed : [];
      
      // Создаем Map для быстрого поиска промокодов
      // Используем строковые ключи для надежности (ID могут быть числами или строками)
      const promoCodesMap = new Map<string, string>();
      console.log(`[api/discounts] Processing ${claimed.length} claimed items for promo codes...`);
      
      claimed.forEach((item: any, index: number) => {
        console.log(`[api/discounts] Processing claimed item ${index}:`, {
          type: typeof item,
          isObject: typeof item === 'object',
          item: item,
          hasId: !!item?.id,
          hasPromoCode: !!item?.promoCode,
        });
        
        let discountId: string | null = null;
        let promoCode: string | null = null;
        
        if (typeof item === 'object' && item !== null && item.id) {
          // Новый формат: объект с id и promoCode
          discountId = String(item.id);
          promoCode = item.promoCode 
            ? (typeof item.promoCode === 'string' ? item.promoCode.trim() : String(item.promoCode).trim())
            : null;
        } else if (typeof item === 'number') {
          // Старый формат: просто число (ID скидки)
          discountId = String(item);
          promoCode = null; // Промокода нет в старом формате
          console.log(`[api/discounts] ⚠️ Old format detected for discount ${discountId}, no promo code in data`);
        } else {
          console.log(`[api/discounts] ⚠️ Skipping invalid claimed item ${index}:`, item);
          return; // Пропускаем невалидный элемент
        }
        
        if (discountId) {
          if (promoCode && promoCode.length > 0 && promoCode !== 'null' && promoCode !== 'undefined') {
            promoCodesMap.set(discountId, promoCode);
            console.log(`[api/discounts] ✅ Mapped promo code for discount ${discountId}:`, promoCode);
          } else {
            console.log(`[api/discounts] ⚠️ No valid promo code for discount ${discountId} (will try to get from BestBenefits if needed)`);
          }
        }
      });
      
      console.log(`[api/discounts] Total promo codes in map: ${promoCodesMap.size}`);
      console.log(`[api/discounts] Promo codes map:`, Array.from(promoCodesMap.entries()));

      // Добавляем промокоды к скидкам (промокоды из preferences имеют приоритет)
      console.log(`[api/discounts] Enriching ${payload.discounts?.length || 0} discounts with promo codes...`);
      
      // Создаем Set для быстрой проверки, какие скидки получены (включая старый формат)
      const claimedIdsSet = new Set<string>();
      claimed.forEach((item: any) => {
        if (typeof item === 'object' && item !== null && item.id) {
          claimedIdsSet.add(String(item.id));
        } else if (typeof item === 'number') {
          claimedIdsSet.add(String(item));
        }
      });
      
      payload.discounts = payload.discounts.map((discount: any) => {
        const discountId = String(discount.id); // Нормализуем ID к строке для сравнения
        const savedPromoCode = promoCodesMap.get(discountId);
        const isClaimed = claimedIdsSet.has(discountId);
        
        if (savedPromoCode) {
          // Промокод из preferences всегда имеет приоритет
          console.log(`[api/discounts] ✅ Enriching discount ${discountId} (${discount.title}) with saved promo code:`, savedPromoCode);
          return {
            ...discount,
            promoCode: savedPromoCode,
          };
        } else if (isClaimed) {
          // Скидка получена, но промокода нет в preferences (старый формат или не синхронизировано)
          // В этом случае промокод должен быть получен через синхронизацию с BestBenefits
          console.log(`[api/discounts] ⚠️ Discount ${discountId} (${discount.title}) is claimed but has no promo code in preferences. User should sync with BestBenefits.`);
          // Не добавляем промокод, так как его нет в preferences - пользователю нужно синхронизироваться
        } else {
          console.log(`[api/discounts] ℹ️ Discount ${discountId} (${discount.title}) is not claimed`);
        }
        return discount;
      });
      
      console.log(`[api/discounts] Final discounts with promo codes:`, payload.discounts.map((d: any) => ({
        id: d.id,
        title: d.title,
        promoCode: d.promoCode,
      })));
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (error) {
    console.error("[api/discounts] Failed to load discounts:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить скидки" },
      { status: 500 }
    );
  }
}

function buildSearchParams(request: NextRequest): DiscountSearchParams {
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const getNumber = (value: string | null) => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseBool = (value: string | null) => {
    if (!value) return false;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  };

  const categoryIds: number[] = [];
  const singleParam = searchParams.get("categoryIds");
  if (singleParam) {
    singleParam
      .split(",")
      .map((value) => value.trim())
      .forEach((value) => {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          categoryIds.push(parsed);
        }
      });
  }

  const groupedParams = searchParams.getAll("categoryId");
  groupedParams.forEach((value) => {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      categoryIds.push(parsed);
    }
  });

  return {
    search: searchParams.get("search") ?? undefined,
    cityId: getNumber(searchParams.get("cityId")) ?? null,
    categoryIds: categoryIds.length > 0 ? Array.from(new Set(categoryIds)) : undefined,
    premiumOnly: parseBool(searchParams.get("premiumOnly")),
    nearMe: parseBool(searchParams.get("nearMe")),
    radiusKm: getNumber(searchParams.get("radiusKm")) ?? null,
    lat: getNumber(searchParams.get("lat")) ?? null,
    lng: getNumber(searchParams.get("lng")) ?? null,
    page: getNumber(searchParams.get("page")) ?? 1,
    limit: getNumber(searchParams.get("limit")) ?? 15,
    view: (searchParams.get("view") as any) ?? "all",
    ids: searchParams.get("ids"),
  };
}

async function enrichParamsWithPreference(params: DiscountSearchParams, userId: string) {
  if (!params.view || params.view === "all") {
    return;
  }

  if (params.ids && params.ids.length > 0) {
    return;
  }

  try {
    const preference = await (prisma as any).discountPreference?.findUnique({
      where: { userId },
    });
    const filters = preference?.filters as any;
    if (!filters) {
      return;
    }
    const list: number[] | undefined =
      params.view === "favorites" ? filters?.favorites : filters?.claimed;
    if (list?.length) {
      params.ids = list.join(",");
    }
    // Если список пустой, не устанавливаем params.ids - вернется пустой результат
  } catch (error) {
    console.warn("[api/discounts] Failed to load preference filters:", error);
  }
}

