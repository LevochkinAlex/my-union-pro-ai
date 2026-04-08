import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDemoUserId, getDemoDiscounts } from "@/lib/demo";
import type { DiscountItem, DiscountSearchResult, DiscountCategory, DiscountCity } from "@/types/discounts";

/**
 * GET /api/discounts/local
 * Получение скидок из локальной базы данных
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (isDemoUserId(session.user.id)) {
      const { discounts, total } = getDemoDiscounts();
      return NextResponse.json({ discounts, total, page: 1, limit: 20, totalPages: 1, categories: [], cities: [] });
    }

    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // Параметры поиска
    const search = searchParams.get("search")?.trim() || null;
    const cityId = searchParams.get("cityId") ? Number(searchParams.get("cityId")) : null;
    const categoryIds = searchParams.get("categoryIds")
      ?.split(",")
      .map(Number)
      .filter((n) => !isNaN(n)) || [];
    const premiumOnly = searchParams.get("premiumOnly") === "1";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
    const view = searchParams.get("view") || "all";
    const ids = searchParams.get("ids")?.split(",").map(Number).filter((n) => !isNaN(n)) || null;

    // Базовый фильтр
    const where: any = {
      isActive: true,
    };

    // Фильтр по конкретным IDs (для избранного/полученных)
    if (ids && ids.length > 0) {
      where.id = { in: ids };
    }

    // Поиск по тексту
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { shortDescription: { contains: search, mode: "insensitive" } },
      ];
    }

    // Фильтр по категориям (JSON поле)
    if (categoryIds.length > 0) {
      // Используем raw SQL для фильтрации по JSON массиву
      // Prisma не поддерживает нативно фильтрацию по JSON
      where.mainCategoryId = { in: categoryIds };
    }

    // Фильтр по премиум
    if (premiumOnly) {
      where.isPremium = true;
    }

    // Фильтр по сроку действия
    where.OR = [
      ...(where.OR || []),
      { validUntil: null },
      { validUntil: { gte: new Date() } },
    ];

    // Если был текстовый поиск, объединяем условия
    if (search) {
      const searchConditions = where.OR.slice(0, 3);
      const validityConditions = where.OR.slice(3);
      delete where.OR;
      where.AND = [
        { OR: searchConditions },
        { OR: validityConditions.length > 0 ? validityConditions : [{ id: { not: -1 } }] },
      ];
    } else if (where.OR?.length === 2) {
      // Только условия validUntil
      where.OR = where.OR;
    }

    // Подсчёт общего количества
    const total = await prisma.discount.count({ where });

    // Получаем скидки с пагинацией
    const discounts = await prisma.discount.findMany({
      where,
      orderBy: [
        { isPremium: "desc" },
        { lastSyncedAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Преобразуем в формат DiscountItem
    const items: DiscountItem[] = discounts.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      shortDescription: d.shortDescription,
      discountValue: d.discountValue,
      promoCode: null, // Промокоды загружаются отдельно
      partnerUrl: d.partnerUrl,
      imageUrl: d.imageUrl,
      tags: (d.tags as string[]) || [],
      isPremium: d.isPremium,
      categories: (d.categories as any[]) || [],
      mainCategory: d.mainCategoryId
        ? { id: d.mainCategoryId, name: d.mainCategoryName || "" }
        : null,
      cities: (d.cities as any[]) || [],
      options: (d.options as any[]) || null, // Варианты скидки (например Яндекс Лавка)
      updatedAt: d.bbUpdatedAt?.toISOString() || null,
      validUntil: d.validUntil?.toISOString() || null,
    }));

    // Фильтрация по городу (клиентская, т.к. cities - JSON)
    let filteredItems = items;
    if (cityId) {
      filteredItems = items.filter((item) => {
        // Глобальные скидки (без городов) показываем всегда
        if (!item.cities || item.cities.length === 0) return true;
        // Проверяем наличие города
        return item.cities.some((c: any) => c.id === cityId);
      });
    }

    // Обогащаем промокодами из DiscountActivation
    const activations = await prisma.discountActivation.findMany({
      where: {
        userId: session.user.id,
        discountId: { in: filteredItems.map((d) => d.id) },
      },
    });

    const promoCodesMap = new Map<number, string>();
    activations.forEach((a) => {
      if (a.promoCode) {
        promoCodesMap.set(a.discountId, a.promoCode);
      }
    });

    filteredItems = filteredItems.map((item) => ({
      ...item,
      promoCode: promoCodesMap.get(item.id) || item.promoCode,
    }));

    // Получаем все категории
    const categories = await prisma.discountCategory.findMany({
      orderBy: { order: "asc" },
    });

    // Извлекаем уникальные города из скидок
    const citiesMap = new Map<number, DiscountCity>();
    const allDiscountsForCities = await prisma.discount.findMany({
      where: { isActive: true },
      select: { cities: true },
    });
    
    allDiscountsForCities.forEach((d) => {
      const cities = (d.cities as any[]) || [];
      cities.forEach((city: any) => {
        if (city.id && city.name) {
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
        total: cityId ? filteredItems.length : total,
        page,
        perPage: limit,
        hasMore: cityId 
          ? false // При фильтрации по городу всё загружено
          : page * limit < total,
      },
      fetchedAt: new Date().toISOString(),
      source: "remote", // Помечаем как remote для совместимости
    };

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=60", // Кэшируем локальные данные дольше
      },
    });
  } catch (error) {
    console.error("[api/discounts/local] Error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить скидки" },
      { status: 500 }
    );
  }
}

