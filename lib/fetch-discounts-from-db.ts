import { Prisma } from "@prisma/client";
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

    // При фильтре по городу: считаем и выбираем скидки с фильтром по cities в БД,
    // чтобы не резать по take(limit) до фильтрации и не показывать только 20.
    const useCityFilterInDb = Boolean(cityId && !search);

    let total: number;
    let discounts: Array<{
      id: number;
      title: string;
      description: string | null;
      shortDescription: string | null;
      discountValue: string | null;
      partnerUrl: string | null;
      imageUrl: string | null;
      tags: unknown;
      isPremium: boolean;
      categories: unknown;
      mainCategoryId: number | null;
      mainCategoryName: string | null;
      cities: unknown;
      options: unknown;
      bbUpdatedAt: Date | null;
      validUntil: Date | null;
    }>;

    if (useCityFilterInDb && cityId != null) {
      // Условие по городу: глобальные (cities пусто/null) или в списке городов есть cityId
      const cityCondition = Prisma.sql`(
        "cities" IS NULL
        OR "cities"::jsonb = '[]'::jsonb
        OR (
          jsonb_typeof("cities"::jsonb) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("cities"::jsonb) AS e
            WHERE (e->>'id')::int = ${cityId}
          )
        )
      )`;
      const baseConditions = [Prisma.sql`"isActive" = true`, Prisma.sql`("validUntil" IS NULL OR "validUntil" >= NOW())`, cityCondition];
      if (ids && ids.length > 0) {
        baseConditions.push(Prisma.sql`"id" = ANY(${ids})`);
      }
      if (categoryIds.length > 0) {
        baseConditions.push(Prisma.sql`"mainCategoryId" = ANY(${categoryIds})`);
      }
      if (premiumOnly) {
        baseConditions.push(Prisma.sql`"isPremium" = true`);
      }
      const whereSql = Prisma.join(baseConditions, " AND ");

      const [countResult, rows] = await Promise.all([
        prisma.$queryRaw<[{ count: bigint }]>(
          Prisma.sql`SELECT count(*)::int AS count FROM "Discount" WHERE ${whereSql}`
        ),
        prisma.$queryRaw<
          Array<{
            id: number;
            title: string;
            description: string | null;
            shortDescription: string | null;
            discountValue: string | null;
            partnerUrl: string | null;
            imageUrl: string | null;
            tags: unknown;
            isPremium: boolean;
            categories: unknown;
            mainCategoryId: number | null;
            mainCategoryName: string | null;
            cities: unknown;
            options: unknown;
            bbUpdatedAt: Date | null;
            validUntil: Date | null;
          }>
        >(
          Prisma.sql`
            SELECT id, title, description, "shortDescription", "discountValue", "partnerUrl", "imageUrl",
                   tags, "isPremium", categories, "mainCategoryId", "mainCategoryName", cities, options,
                   "bbUpdatedAt", "validUntil"
            FROM "Discount"
            WHERE ${whereSql}
            ORDER BY "isPremium" DESC, "lastSyncedAt" DESC
            LIMIT ${limit} OFFSET ${(page - 1) * limit}
          `
        ),
      ]);
      total = Number(countResult[0]?.count ?? 0);
      discounts = rows;
    } else {
      const [totalCount, list] = await Promise.all([
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
      ]);
      total = totalCount;
      discounts = list;
    }

    const categories = await prisma.discountCategory.findMany({
      orderBy: { order: "asc" },
    });

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
      discounts: items,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order,
        count: c.discountCount,
      })),
      cities,
      meta: {
        total,
        page,
        perPage: limit,
        hasMore: page * limit < total,
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
