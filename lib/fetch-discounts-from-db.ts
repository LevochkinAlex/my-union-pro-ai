import { prisma } from "@/lib/prisma";
import type {
  DiscountSearchParams,
  DiscountSearchResult,
  DiscountItem,
  DiscountCity,
  DiscountCategory,
} from "@/types/discounts";

/**
 * Загружает скидки из локальной БД (таблица Discount, заполняется кроном sync-discounts).
 * Используется как fallback, когда BestBenefits API недоступен или возвращает ошибку.
 * Возвращает null при ошибке или если в БД нет скидок.
 */
export async function getDiscountsFromLocalDB(
  params: DiscountSearchParams
): Promise<DiscountSearchResult | null> {
  try {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const cityId = params.cityId ?? null;
    const categoryIds = params.categoryIds ?? [];
    const premiumOnly = params.premiumOnly ?? false;
    const search = params.search?.trim() || null;
    const ids = params.ids
      ? params.ids
          .split(",")
          .map((id) => Number(id.trim()))
          .filter((n) => !Number.isNaN(n))
      : null;

    const where: any = {
      isActive: true,
      OR: [
        { validUntil: null },
        { validUntil: { gte: new Date() } },
      ],
    };

    if (ids && ids.length > 0) {
      where.id = { in: ids };
    }
    if (categoryIds.length > 0) {
      where.mainCategoryId = { in: categoryIds };
    }
    if (premiumOnly) {
      where.isPremium = true;
    }
    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { shortDescription: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const [total, discounts, categories] = await Promise.all([
      prisma.discount.count({ where }),
      prisma.discount.findMany({
        where,
        orderBy: [
          { isPremium: "desc" },
          { lastSyncedAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.discountCategory.findMany({
        orderBy: { order: "asc" },
      }),
    ]);

    const items: DiscountItem[] = discounts.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      shortDescription: d.shortDescription,
      discountValue: d.discountValue,
      promoCode: null,
      partnerUrl: d.partnerUrl,
      imageUrl: d.imageUrl,
      tags: (d.tags as string[]) || [],
      isPremium: d.isPremium,
      categories: (d.categories as any[]) || [],
      mainCategory: d.mainCategoryId
        ? { id: d.mainCategoryId, name: d.mainCategoryName || "" }
        : null,
      cities: (d.cities as any[]) || [],
      options: (d.options as any[]) || null,
      updatedAt: d.bbUpdatedAt?.toISOString() || null,
      validUntil: d.validUntil?.toISOString() || null,
    }));

    // Фильтр по городу (cities в JSON)
    let filteredItems = items;
    if (cityId && !search) {
      filteredItems = items.filter((item) => {
        if (!item.cities || item.cities.length === 0) return true;
        return item.cities.some((c: any) => c.id === cityId);
      });
    }

    const citiesMap = new Map<number, DiscountCity>();
    const allForCities = await prisma.discount.findMany({
      where: { isActive: true },
      select: { cities: true },
    });
    allForCities.forEach((d) => {
      const cities = (d.cities as any[]) || [];
      cities.forEach((city: any) => {
        if (city?.id && city?.name) {
          citiesMap.set(city.id, { id: city.id, name: city.name });
        }
      });
    });
    const cities = Array.from(citiesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "ru-RU")
    );

    const result: DiscountSearchResult = {
      discounts: filteredItems,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order,
        count: c.discountCount,
      })),
      cities,
      meta: {
        total: cityId && !search ? filteredItems.length : total,
        page,
        perPage: limit,
        hasMore: cityId && !search ? false : page * limit < total,
      },
      fetchedAt: new Date().toISOString(),
      source: "fallback",
    };

    return result.discounts.length > 0 ? result : null;
  } catch (error) {
    console.error("[fetch-discounts-from-db] Error:", error);
    return null;
  }
}
