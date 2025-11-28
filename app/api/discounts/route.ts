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
      const promoCodesMap = new Map<number, string>();
      claimed.forEach((item: any) => {
        if (typeof item === 'object' && item.id && item.promoCode) {
          promoCodesMap.set(item.id, item.promoCode);
        }
      });

      // Добавляем промокоды к скидкам
      payload.discounts = payload.discounts.map((discount: any) => {
        const savedPromoCode = promoCodesMap.get(discount.id);
        if (savedPromoCode && (!discount.promoCode || discount.promoCode.trim().length === 0)) {
          console.log(`[api/discounts] Enriching discount ${discount.id} with saved promo code:`, savedPromoCode);
          return {
            ...discount,
            promoCode: savedPromoCode,
          };
        }
        return discount;
      });
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

  if (ids && ids.length > 0) {
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
      ids = list.join(",");
    }
    // Если список пустой, не устанавливаем ids - вернется пустой результат
  } catch (error) {
    console.warn("[api/discounts] Failed to load preference filters:", error);
  }
}

