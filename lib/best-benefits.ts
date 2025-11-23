import fs from "fs/promises";
import path from "path";
import {
  BestBenefitsDiscount,
  BestBenefitsResponse,
  DiscountCategory,
  DiscountCity,
  DiscountItem,
  DiscountSearchParams,
  DiscountSearchResult,
} from "@/types/discounts";
import { attachCoordinatesToCities, calculateDistanceKm, getCityCoordinates } from "@/lib/geo";
import { getBestBenefitsToken } from "@/lib/best-benefits-auth";
import { getAllRussianCities } from "@/lib/constants/russian-regions";

const SAMPLE_FILE = path.join(process.cwd(), "public", "best_benefits", "sample-discounts.json");
const API_BASE_URL = process.env.BEST_BENEFITS_API_URL ?? "https://bestbenefits.ru/api/products";
const USE_REAL_API = process.env.USE_REAL_BB_API === "true";

type FetchContext = {
  source: "remote" | "fallback";
  fetchedAt: string;
};

export async function fetchBestBenefitsDiscounts(
  params: DiscountSearchParams = {}
): Promise<DiscountSearchResult> {
  const sanitizedParams = {
    ...params,
    limit: params.limit ?? 15,
    page: params.page ?? 1,
  };

  // Use real API if configured
  if (USE_REAL_API) {
    try {
      const remoteData = await fetchFromRemote(sanitizedParams);
      return normalizeResponse(remoteData, sanitizedParams, { source: "remote", fetchedAt: new Date().toISOString() });
    } catch (error) {
      console.error("[best-benefits] Real API fetch failed:", error);
      // Fallback to sample data if real API fails
      const fallbackData = await fetchFromSample();
      return normalizeResponse(fallbackData, sanitizedParams, { source: "fallback", fetchedAt: new Date().toISOString() });
    }
  }

  // Use sample data by default (for testing)
  console.log("[best-benefits] Using sample data (USE_REAL_BB_API not enabled)");
  const fallbackData = await fetchFromSample();
  return normalizeResponse(fallbackData, sanitizedParams, { source: "fallback", fetchedAt: new Date().toISOString() });
}

async function fetchFromRemote(params: DiscountSearchParams): Promise<BestBenefitsResponse> {
  if (!API_BASE_URL) {
    throw new Error("BestBenefits API url is not defined");
  }

  // Get authentication token
  const token = await getBestBenefitsToken();

  // Если запрашивается конкретная скидка по ID, пробуем получить её отдельно
  if (params.ids && params.ids.split(",").length === 1) {
    const singleId = params.ids.trim();
    try {
      const singleUrl = `${API_BASE_URL}/${singleId}`;
      console.log("[best-benefits] Fetching single discount from API:", singleUrl);
      
      const singleResponse = await fetch(singleUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (singleResponse.ok) {
        const singleData = await singleResponse.json();
        // Если API возвращает один объект, оборачиваем в массив
        const discount = singleData.data || singleData;
        if (discount) {
          console.log("[best-benefits] Fetched single discount with full details");
          return {
            data: Array.isArray(discount) ? discount : [discount],
            meta: {
              total: 1,
              per_page: 1,
              current_page: 1,
              last_page: 1,
            },
          } as BestBenefitsResponse;
        }
      } else {
        console.log("[best-benefits] Single discount endpoint not available, falling back to list");
      }
    } catch (error) {
      console.log("[best-benefits] Error fetching single discount, falling back to list:", error);
    }
  }

  const searchParams = new URLSearchParams();
  // Передаем параметры, которые API точно поддерживает
  // НЕ передаем cityId - API не фильтрует правильно, делаем клиентскую фильтрацию
  if (params.search) searchParams.set("search", params.search);
  // if (params.cityId) searchParams.set("city_id", String(params.cityId)); // Отключено - API не фильтрует правильно
  if (params.categoryIds?.length) searchParams.set("category_ids", params.categoryIds.join(","));
  if (params.premiumOnly) searchParams.set("premium", "1");
  if (params.limit) searchParams.set("per_page", String(params.limit));
  if (params.page) searchParams.set("page", String(params.page));
  // Попытка использовать ids для favorites/claimed (если API поддерживает)
  if (params.ids) searchParams.set("ids", params.ids);

  const url = `${API_BASE_URL}?${searchParams.toString()}`;
  console.log("[best-benefits] Fetching from API:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    // Disable caching to avoid "item over 2MB" errors
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[best-benefits] API error:", response.status, errorText);
    throw new Error(`BestBenefits API responded with ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as BestBenefitsResponse;
  console.log("[best-benefits] Fetched", data?.data?.length ?? 0, "discounts from API");
  
  // Логируем первый элемент для проверки наличия описания
  if (data?.data?.length > 0) {
    const first = data.data[0];
    console.log("[best-benefits] Sample discount fields:", {
      id: first.id,
      hasDescription: !!first.description,
      descriptionLength: first.description?.length || 0,
      hasShortDescription: !!first.short_description,
      shortDescriptionLength: first.short_description?.length || 0,
      hasPromoCode: !!first.promo_code,
      promoCode: first.promo_code,
    });
  }
  
  return data;
}

async function fetchFromSample(): Promise<BestBenefitsResponse> {
  try {
    const buffer = await fs.readFile(SAMPLE_FILE, "utf-8");
    return JSON.parse(buffer) as BestBenefitsResponse;
  } catch (error) {
    console.error("[best-benefits] Sample file not found, returning empty data:", error);
    // Return empty data structure if sample file doesn't exist
    return {
      data: [],
      meta: {
        total: 0,
        per_page: 15,
        current_page: 1,
        last_page: 1,
      },
    } as BestBenefitsResponse;
  }
}

function normalizeResponse(
  raw: BestBenefitsResponse,
  params: DiscountSearchParams,
  context: FetchContext
): DiscountSearchResult {
  const rawDiscounts = raw?.data ?? [];

  const discounts: DiscountItem[] = rawDiscounts.map((discount) => normalizeDiscount(discount));
  
  // Apply all filters for fallback data
  let filtered = discounts;
  
  // Filter by city - ВАЖНО: фильтруем строго по ID города + включаем глобальные скидки
  if (params.cityId) {
    // Находим название выбранного города для логирования
    const selectedCityName = discounts
      .flatMap(d => d.cities)
      .find(c => c.id === params.cityId)?.name || `ID:${params.cityId}`;
    
    const globalDiscounts = discounts.filter(d => d.cities.length === 0).length;
    const citySpecificDiscounts = discounts.filter(d => d.cities.length > 0).length;
    
    console.log(`[best-benefits] 🔍 Filtering by cityId: ${params.cityId} (${selectedCityName})`);
    console.log(`[best-benefits] 📊 Before filter: ${discounts.length} discounts (${globalDiscounts} global, ${citySpecificDiscounts} city-specific)`);
    
    filtered = filtered.filter((discount) => {
      // Если у скидки нет городов - она доступна везде (глобальная)
      if (discount.cities.length === 0) {
        console.log(`[best-benefits] 🌍 Discount ${discount.id} "${discount.title}" INCLUDED (global discount, no cities)`);
        return true;
      }
      
      // Иначе проверяем наличие выбранного города
      const cityIds = discount.cities.map(c => c.id);
      const cityNames = discount.cities.map(c => c.name);
      const hasCity = cityIds.includes(params.cityId!);
      
      if (hasCity) {
        console.log(`[best-benefits] ✅ Discount ${discount.id} "${discount.title}" INCLUDED. Cities: ${cityNames.join(', ')} (IDs: ${cityIds.join(', ')})`);
      } else {
        console.log(`[best-benefits] ❌ Discount ${discount.id} "${discount.title}" FILTERED OUT. Cities: ${cityNames.join(', ')} (IDs: ${cityIds.join(', ')})`);
      }
      
      return hasCity;
    });
    
    console.log(`[best-benefits] 📊 After city filter: ${filtered.length} discounts (was ${discounts.length})`);
    
    if (filtered.length === 0 && discounts.length > 0) {
      console.warn(`[best-benefits] ⚠️ WARNING: No discounts found for cityId ${params.cityId} (${selectedCityName})!`);
      console.warn(`[best-benefits] Available city IDs in discounts:`, 
        Array.from(new Set(discounts.flatMap(d => d.cities.map(c => `${c.name}(${c.id})`)))).join(', ')
      );
    }
  }
  
  // Filter by categories
  if (params.categoryIds && params.categoryIds.length > 0) {
    filtered = filtered.filter((discount) =>
      discount.categories.some((cat) => params.categoryIds!.includes(cat.id))
    );
  }
  
  // Filter by search
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filtered = filtered.filter(
      (discount) =>
        discount.title.toLowerCase().includes(searchLower) ||
        discount.description?.toLowerCase().includes(searchLower) ||
        discount.shortDescription?.toLowerCase().includes(searchLower)
    );
  }
  
  // Filter by premium
  if (params.premiumOnly) {
    filtered = filtered.filter((discount) => discount.isPremium);
  }
  
  // Filter by specific IDs (for detail page or favorites/claimed)
  if (params.ids) {
    const idList = params.ids
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => !Number.isNaN(id));
    
    if (idList.length > 0) {
      filtered = filtered.filter((discount) => idList.includes(discount.id));
    }
  }
  
  // Apply geo filter (nearMe)
  const filteredByRadius = applyGeoFilter(filtered, params);
  
  // Apply view filter (favorites/claimed) - это уже не нужно если ids указаны
  const filteredByView = params.ids ? filteredByRadius : applyViewFilter(filteredByRadius, params);

  const categories = extractCategories(discounts); // Use all discounts for category list
  const cities = extractCities(discounts); // Use all discounts for city list

  const paginated = paginate(filteredByView, params.page ?? 1, params.limit ?? filteredByView.length);

  return {
    discounts: paginated.items,
    categories,
    cities: attachCoordinatesToCities(cities),
    meta: {
      total: filteredByView.length,
      page: paginated.page,
      perPage: paginated.perPage,
    },
    fetchedAt: context.fetchedAt,
    source: context.source,
  };
}

function paginate<T>(items: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  const end = start + perPage;
  return {
    items: items.slice(start, end),
    page,
    perPage,
  };
}

function normalizeDiscount(discount: BestBenefitsDiscount): DiscountItem {
  const base64Image = discount.image?.trim();
  const imageUrl = discount.image_url ?? (base64Image ? `data:image/jpeg;base64,${base64Image}` : null);
  const categories: DiscountCategory[] = (discount.categories ?? [])
    .filter(Boolean)
    .map((category) => ({
      id: category.id,
      name: category.name,
      order: category.order,
    }));

  // Фильтруем только российские города
  const russianCityNames = getAllRussianCities();
  const cityList: DiscountCity[] = (discount.cities ?? [])
    .filter((city) => {
      // Проверяем, является ли город российским
      const isRussian = russianCityNames.some(
        (ruCity) => ruCity.toLowerCase() === city.name.toLowerCase()
      );
      if (!isRussian && city.name) {
        console.log(`[best-benefits] Filtered out non-Russian city: ${city.name} (ID: ${city.id})`);
      }
      return isRussian;
    })
    .map((city) => ({
      id: city.id, // Сохраняем оригинальный ID из API
      name: city.name,
      coordinates: getCityCoordinates(city.name),
    }));

  // Используем description и shortDescription как есть из API
  // НЕ удаляем их - пусть отображаются в блоке "Города" отдельно
  const description = discount.description || null;
  const shortDescription = discount.short_description || null;
  
  console.log(`[best-benefits] Discount ${discount.id} "${discount.name}":`, {
    hasPromoCode: !!discount.promo_code,
    promoCode: discount.promo_code,
    hasDescription: !!description,
    descriptionLength: description?.length || 0,
    hasShortDescription: !!shortDescription,
    shortDescriptionLength: shortDescription?.length || 0,
    hasCtaUrl: !!discount.cta_url,
    ctaUrl: discount.cta_url,
  });

  return {
    id: discount.id,
    title: discount.name,
    description: description || null, // Используем очищенное описание
    shortDescription: shortDescription || null, // Используем очищенное краткое описание
    discountValue: discount.discount_value,
    promoCode: discount.promo_code,
    partnerUrl: discount.cta_url ?? null,
    imageUrl,
    tags: discount.tags ?? [],
    isPremium: Boolean(discount.isPremium),
    categories,
    mainCategory: discount.main_category
      ? {
        id: discount.main_category.id,
        name: discount.main_category.name,
        order: discount.main_category.order,
      }
      : undefined,
    cities: cityList.length > 0 ? cityList : [{ id: 0, name: "Онлайн" }],
    updatedAt: discount.updated_at ?? discount.created_at ?? null,
    validUntil: discount.end ?? null,
  };
}

function extractCategories(discounts: DiscountItem[]): DiscountCategory[] {
  const map = new Map<number, DiscountCategory & { count: number }>();
  discounts.forEach((discount) => {
    discount.categories.forEach((category) => {
      map.set(category.id, {
        ...category,
        count: (map.get(category.id)?.count ?? 0) + 1,
      });
    });
  });
  return Array.from(map.values()).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

function extractCities(discounts: DiscountItem[]): DiscountCity[] {
  const map = new Map<number, DiscountCity & { count: number }>();
  
  // Используем единый список российских городов из константы
  const russianCityNames = getAllRussianCities();
  const russianCitiesSet = new Set(russianCityNames.map(name => name.toLowerCase()));
  
  // Список городов Казахстана и других стран СНГ для исключения
  const excludedCities = new Set([
    'алматы', 'астана', 'нур-султан', 'шымкент', 'караганда', 'актобе',
    'тараз', 'павлодар', 'усть-каменогорск', 'семей', 'атырау', 'костанай',
    'кызылорда', 'петропавловск', 'туркестан', 'кокшетау', 'талдыкорган',
    'экибастуз', 'рудный', 'казалинск', 'жезказган', 'балхаш', 'сатпаев',
    'минск', 'гомель', 'могилёв', 'витебск', 'гродно', 'брест',
    'ташкент', 'самарканд', 'наманган', 'андижан', 'фергана',
    'киев', 'харьков', 'одесса', 'днепр', 'донецк', 'запорожье',
    'кишинёв', 'бельцы', 'тирасполь',
    'баку', 'гянджа', 'сумгаит',
    'ереван', 'гюмри', 'ванадзор',
    'тбилиси', 'батуми', 'кутаиси',
    'бишкек', 'ош', 'джалал-абад',
    'душанбе', 'худжанд', 'куляб'
  ]);
  
  discounts.forEach((discount) => {
    discount.cities.forEach((city) => {
      const cityNameLower = city.name.toLowerCase();
      
      // Исключаем города из Казахстана и других стран СНГ
      if (excludedCities.has(cityNameLower)) {
        return;
      }
      
      // Фильтруем только российские города
      if (russianCitiesSet.has(cityNameLower)) {
        map.set(city.id, {
          ...city,
          count: (map.get(city.id)?.count ?? 0) + 1,
        });
      }
    });
  });
  
  // Sort cities alphabetically by name (Russian locale)
  return Array.from(map.values()).sort((a, b) => 
    a.name.localeCompare(b.name, 'ru-RU')
  );
}

function applyGeoFilter(discounts: DiscountItem[], params: DiscountSearchParams): DiscountItem[] {
  if (!params.nearMe || !params.lat || !params.lng || !params.radiusKm) {
    return discounts;
  }

  return discounts
    .map((discount) => {
      const cityWithCoords = discount.cities.find((city) => city.coordinates);
      if (!cityWithCoords || !cityWithCoords.coordinates) {
        return discount;
      }

      const distance = calculateDistanceKm(
        { lat: params.lat!, lng: params.lng! },
        cityWithCoords.coordinates
      );

      return {
        ...discount,
        distanceKm: distance,
      };
    })
    .filter((discount) => {
      if (!discount.distanceKm || !params.radiusKm) {
        return true;
      }
      return discount.distanceKm <= params.radiusKm;
    })
    .sort((a, b) => {
      if (a.distanceKm && b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });
}

function applyViewFilter(discounts: DiscountItem[], params: DiscountSearchParams): DiscountItem[] {
  if (!params.view || params.view === "all") {
    return discounts;
  }

  const idList = (params.ids ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => !Number.isNaN(id));

  if (idList.length === 0) {
    return [];
  }

  return discounts.filter((discount) => idList.includes(discount.id));
}

