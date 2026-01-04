import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";
import type { DiscountSearchParams, DiscountOption } from "@/types/discounts";
import { prisma } from "@/lib/prisma";
import { getValidActivatedDiscounts, needsSync } from "@/lib/discount-activation";
import { decryptPassword } from "@/lib/best-benefits-password";
import { getUserBestBenefitsToken } from "@/lib/best-benefits-user-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const params = buildSearchParams(request);
    await enrichParamsWithPreference(params, session.user.id);
    const payload = await fetchBestBenefitsDiscounts(params);

    // ОСНОВНОЙ ИСТОЧНИК: получаем активированные скидки из DiscountActivation
    const activations = await getValidActivatedDiscounts(session.user.id);
    
    // Создаём Map для быстрого доступа к промокодам
    const promoCodesMap = new Map<string, string>();
    const activatedIdsSet = new Set<string>();
    
    for (const activation of activations) {
      const discountId = String(activation.discountId);
      activatedIdsSet.add(discountId);
      
      if (activation.promoCode) {
        promoCodesMap.set(discountId, activation.promoCode);
      }
    }

    console.log(`[api/discounts] Found ${activations.length} activated discounts, ${promoCodesMap.size} with promo codes`);

    // Обогащаем скидки промокодами
    if (payload.discounts && payload.discounts.length > 0) {
      payload.discounts = payload.discounts.map((discount: any) => {
        const discountId = String(discount.id);
        const savedPromoCode = promoCodesMap.get(discountId);
        const isClaimed = activatedIdsSet.has(discountId);
        
        if (savedPromoCode) {
          return {
            ...discount,
            promoCode: savedPromoCode,
            isClaimed: true,
          };
        } else if (isClaimed) {
          // Скидка активирована, но промокода нет
          return {
            ...discount,
            isClaimed: true,
          };
        }
        
        return discount;
      });
    }

    // Обогащаем описания из локальной БД
    if (payload.discounts && payload.discounts.length > 0) {
      const discountIds = payload.discounts.map((d: any) => d.id);
      const localDiscounts = await prisma.discount.findMany({
        where: { id: { in: discountIds } },
        select: { id: true, description: true, shortDescription: true },
      });
      
      const localDataMap = new Map(localDiscounts.map(d => [d.id, d]));
      
      payload.discounts = payload.discounts.map((discount: any) => {
        const localData = localDataMap.get(discount.id);
        if (localData) {
          return {
            ...discount,
            description: discount.description || localData.description || null,
            shortDescription: discount.shortDescription || localData.shortDescription || null,
          };
        }
        return discount;
      });
    }

    // Обогащаем скидки options если запрашивается одна скидка
    if (payload.discounts && payload.discounts.length === 1 && params.ids) {
      const discount = payload.discounts[0];
      
      if (!discount.options || discount.options.length === 0) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { bestBenefitsUserId: true, bestBenefitsPassword: true }
          });
          
          if (user?.bestBenefitsPassword && user?.bestBenefitsUserId) {
            const password = decryptPassword(user.bestBenefitsPassword);
            const userToken = await getUserBestBenefitsToken(user.bestBenefitsUserId, password);
            
            const response = await fetch(`https://bestbenefits.ru/api/products/${discount.id}`, {
              headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${userToken}`,
              },
            });
            
            if (response.ok) {
              const data = await response.json();
              const bbDiscount = data.data || data;
              
              if (bbDiscount.options && bbDiscount.options.length > 0) {
                const options: DiscountOption[] = bbDiscount.options.map((opt: any) => ({
                  id: opt.id,
                  name: opt.name,
                }));
                
                payload.discounts[0] = {
                  ...discount,
                  options,
                };
              }
            }
          }
        } catch (error) {
          console.warn("[api/discounts] Failed to enrich options:", error);
        }
      }
    }

    // Добавляем метаданные о синхронизации
    const syncNeeded = await needsSync(session.user.id, 10);
    
    return NextResponse.json({
      ...payload,
      meta: {
        ...payload.meta,
        syncNeeded,
        activatedCount: activations.length,
      }
    }, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (error: any) {
    console.error("[api/discounts] Failed to load discounts:", error);
    
    if (error?.message?.includes("timeout") || error?.message?.includes("aborted")) {
      return NextResponse.json(
        { error: "Превышено время ожидания ответа от сервера скидок. Попробуйте позже." },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: "Не удалось загрузить скидки. Попробуйте позже." },
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
    // Для view="claimed" используем DiscountActivation
    if (params.view === "claimed") {
      const activations = await getValidActivatedDiscounts(userId);
      const ids = activations.map(a => a.discountId);
      if (ids.length > 0) {
        params.ids = ids.join(",");
      }
      return;
    }
    
    // Для view="favorites" используем DiscountPreference
    if (params.view === "favorites") {
      const preference = await prisma.discountPreference.findUnique({
        where: { userId },
      });
      const filters = preference?.filters as any;
      const favorites = filters?.favorites;
      
      if (Array.isArray(favorites) && favorites.length > 0) {
        params.ids = favorites.join(",");
      }
    }
  } catch (error) {
    console.warn("[api/discounts] Failed to load preference filters:", error);
  }
}
