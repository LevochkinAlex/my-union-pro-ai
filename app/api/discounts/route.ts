import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo";
import { fetchBestBenefitsDiscounts } from "@/lib/best-benefits";
import type { DiscountSearchParams, DiscountOption, DiscountItem } from "@/types/discounts";
import { prisma } from "@/lib/prisma";
import { getValidActivatedDiscounts, needsSync } from "@/lib/discount-activation";
import { decryptPassword } from "@/lib/best-benefits-password";
import { getUserBestBenefitsToken } from "@/lib/best-benefits-user-auth";
import {
  coalesceBestBenefitsDescriptions,
  mergeDiscountTextWithLocal,
} from "@/lib/best-benefits-description";
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Демо-режим: мок-скидки без BestBenefits и БД
    if (isDemoUserId(session.user.id)) {
      const { getDemoDiscounts } = await import("@/lib/demo");
      const { discounts, total } = getDemoDiscounts();
      return NextResponse.json(
        {
          discounts,
          meta: { total, page: 1, limit: 15, syncNeeded: false, activatedCount: 0 },
        },
        {
          status: 200,
          headers: { "Cache-Control": "private, max-age=30" },
        }
      );
    }

    const params = buildSearchParams(request);

    // Исключённый: только «Мои скидки» (активные/использованные) — доступ по ids
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { membershipStatus: true, unionMembershipStatus: true },
    });
    const isExcluded = user?.membershipStatus === "EXCLUDED" || user?.unionMembershipStatus === "REMOVED";
    const isReApplying = user?.unionMembershipStatus === "REMOVED" &&
      (user?.membershipStatus === "DOCUMENTS_PENDING" || user?.membershipStatus === "PROFILE_INCOMPLETE");
    if (isExcluded && !isReApplying && (!params.ids || params.ids.length === 0)) {
      return NextResponse.json(
        { error: "Доступ к каталогу скидок закрыт. Доступны только активированные скидки в разделе «Мои скидки»." },
        { status: 403 }
      );
    }
    await enrichParamsWithPreference(params, session.user.id);
    const payload = await fetchBestBenefitsDiscounts(params);

    // Для выборки по конкретным IDs (favorites/claimed) добавляем fallback к локальной БД:
    // BestBenefits иногда не отдает отдельные скидки по /products/{id}, хотя они есть локально.
    if (params.ids && payload.discounts?.length > 0) {
      payload.discounts = await mergeMissingDiscountsFromLocal(payload.discounts, params.ids);
    } else if (params.ids && (!payload.discounts || payload.discounts.length === 0)) {
      payload.discounts = await mergeMissingDiscountsFromLocal([], params.ids);
    }

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
            select: { email: true, bestBenefitsUserId: true, bestBenefitsPassword: true }
          });
          
          if (user?.bestBenefitsPassword && user?.email) {
            const password = decryptPassword(user.bestBenefitsPassword);
            const userToken = await getUserBestBenefitsToken(user.email, password);
            
            // Персональный JWT BB — публичный каталог /api/products/{id} (не org /api/myunion).
            const response = await fetch(`https://bestbenefits.ru/api/products/${discount.id}`, {
              headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${userToken}`,
              },
            });
            
            if (response.ok) {
              const data = await response.json();
              const bbDiscount = data.data || data;
              const { description: bbDesc, shortDescription: bbShort } =
                coalesceBestBenefitsDescriptions(bbDiscount as Record<string, unknown>);

              const options: DiscountOption[] | undefined =
                bbDiscount.options?.length > 0
                  ? bbDiscount.options.map((opt: { id: number; name: string }) => ({
                      id: opt.id,
                      name: opt.name,
                    }))
                  : undefined;

              payload.discounts[0] = {
                ...discount,
                ...(options ? { options } : {}),
                ...(bbDesc || bbShort
                  ? {
                      description: bbDesc ?? discount.description,
                      shortDescription: bbShort ?? discount.shortDescription,
                    }
                  : {}),
              };
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

async function mergeMissingDiscountsFromLocal(
  remoteDiscounts: any[],
  idsParam: string
): Promise<DiscountItem[]> {
  const requestedIds = idsParam
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isFinite(id));

  if (requestedIds.length === 0) {
    return remoteDiscounts as DiscountItem[];
  }

  const remoteById = new Map<number, any>();
  for (const discount of remoteDiscounts) {
    if (discount?.id && Number.isFinite(Number(discount.id))) {
      remoteById.set(Number(discount.id), discount);
    }
  }

  const missingIds = requestedIds.filter((id) => !remoteById.has(id));
  if (missingIds.length === 0) {
    return remoteDiscounts as DiscountItem[];
  }

  const now = new Date();
  const localMissing = await prisma.discount.findMany({
    where: {
      id: { in: missingIds },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    },
  });

  const localById = new Map<number, DiscountItem>(
    localMissing.map((discount) => [
      discount.id,
      {
        id: discount.id,
        title: discount.title,
        description: discount.description,
        shortDescription: discount.shortDescription,
        discountValue: discount.discountValue,
        promoCode: null,
        partnerUrl: discount.partnerUrl,
        imageUrl: discount.imageUrl,
        tags: (discount.tags as string[]) || [],
        isPremium: Boolean(discount.isPremium),
        categories: (discount.categories as any[]) || [],
        mainCategory: discount.mainCategoryId
          ? {
              id: discount.mainCategoryId,
              name: discount.mainCategoryName || "",
              order: null,
            }
          : null,
        cities: (discount.cities as any[]) || [],
        updatedAt: discount.bbUpdatedAt?.toISOString() || null,
        validUntil: discount.validUntil?.toISOString() || null,
        options: (discount.options as any[]) || undefined,
      },
    ])
  );

  const merged = requestedIds
    .map((id) => remoteById.get(id) ?? localById.get(id))
    .filter(Boolean) as DiscountItem[];

  return merged;
}
