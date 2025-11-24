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

// Кэш для всех городов (чтобы не загружать их каждый раз)
let allCitiesCache: DiscountCity[] | null = null;
let allCitiesCacheTimestamp: number = 0;
const ALL_CITIES_CACHE_TTL = 5 * 60 * 1000; // 5 минут
let citiesLoadingPromise: Promise<DiscountCity[]> | null = null;

/**
 * Загружает все города из всех скидок для фильтра
 * Использует кэш, чтобы не делать лишние запросы
 * Ограничиваем до 3 страниц, чтобы не перегружать сервер
 */
async function fetchAllCitiesForFilter(): Promise<DiscountCity[]> {
  // Проверяем кэш
  if (allCitiesCache && Date.now() - allCitiesCacheTimestamp < ALL_CITIES_CACHE_TTL) {
    return allCitiesCache;
  }

  // Если уже идет загрузка, возвращаем тот же промис
  if (citiesLoadingPromise) {
    return citiesLoadingPromise;
  }

  if (!USE_REAL_API) {
    return [];
  }

  citiesLoadingPromise = (async () => {
    try {
      const token = await getBestBenefitsToken();
      const allCitiesMap = new Map<number, DiscountCity>();
      
      // Загружаем только первые 3 страницы для извлечения основных городов
      // Это достаточно для большинства случаев и не перегружает сервер
      const maxPages = 3;
      let currentPage = 1;
      let hasMore = true;

      while (hasMore && currentPage <= maxPages) {
        const url = `${API_BASE_URL}?per_page=100&page=${currentPage}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          console.warn(`[best-benefits] Failed to fetch page ${currentPage} for cities`);
          break;
        }

        const data = (await response.json()) as BestBenefitsResponse;
        const discounts = data?.data ?? [];

        // Извлекаем города из этой страницы
        discounts.forEach((discount: any) => {
          const cities = discount.cities ?? [];
          cities.forEach((city: any) => {
            if (city.name && city.name.trim().length > 0 && city.id) {
              allCitiesMap.set(city.id, {
                id: city.id,
                name: city.name,
                slug: city.slug ?? null,
                coordinates: getCityCoordinates(city.name),
              });
            }
          });
        });

        // Проверяем, есть ли еще страницы
        hasMore = data?.meta?.current_page && data?.meta?.last_page 
          ? data.meta.current_page < data.meta.last_page 
          : false;
        
        currentPage++;
      }

      const cities = Array.from(allCitiesMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name, 'ru-RU')
      );

      // Обновляем кэш
      allCitiesCache = cities;
      allCitiesCacheTimestamp = Date.now();
      citiesLoadingPromise = null; // Сбрасываем промис после завершения

      // console.log(`[best-benefits] Loaded ${cities.length} unique cities from ${currentPage - 1} pages`);
      return cities;
    } catch (error) {
      citiesLoadingPromise = null; // Сбрасываем промис при ошибке
      console.error("[best-benefits] Failed to fetch all cities:", error);
      return [];
    }
  })();

  return citiesLoadingPromise;
}

export async function fetchBestBenefitsDiscounts(
  params: DiscountSearchParams = {}
): Promise<DiscountSearchResult> {
  const sanitizedParams = {
    ...params,
    limit: params.limit ?? 20, // Увеличиваем с 15 до 20 для соответствия клиенту
    page: params.page ?? 1,
  };

  // Если передан cityId, но нет cityName, нужно получить название города
  // Сначала пробуем использовать кэш, если его нет - будем искать в текущем ответе после загрузки
  if (USE_REAL_API && sanitizedParams.cityId && !sanitizedParams.cityName) {
    if (allCitiesCache) {
      // Используем кэш, если он есть
      const city = allCitiesCache.find(c => c.id === sanitizedParams.cityId);
      if (city?.name) {
        sanitizedParams.cityName = city.name;
        // console.log(`[best-benefits] Found city name for ID ${sanitizedParams.cityId} from cache: ${city.name}`);
      }
    }
    // Если кэша нет, будем искать в текущем ответе после загрузки (см. ниже)
  }

  // Use real API if configured
  if (USE_REAL_API) {
    try {
      const remoteData = await fetchFromRemote(sanitizedParams);
      const result = await normalizeResponse(remoteData, sanitizedParams, { source: "remote", fetchedAt: new Date().toISOString() });
      
      // Обогащаем список городов из кэша для фильтра (только если кэш уже есть)
      // Загрузка всех городов делается в фоне, чтобы не блокировать основной запрос
      if (allCitiesCache && allCitiesCache.length > 0) {
        // Объединяем города из текущего ответа с городами из кэша
        const citiesMap = new Map<number, DiscountCity>();
        result.cities.forEach(city => citiesMap.set(city.id, city));
        allCitiesCache.forEach(city => {
          if (!citiesMap.has(city.id)) {
            citiesMap.set(city.id, city);
          }
        });
        result.cities = Array.from(citiesMap.values()).sort((a, b) => 
          a.name.localeCompare(b.name, 'ru-RU')
        );
        // console.log(`[best-benefits] Enriched cities list: ${result.cities.length} total (${allCitiesCache.length} from cache)`);
      }
      
      // Загружаем города в фоне для следующего запроса (не блокируем текущий)
      // Только при первой загрузке без фильтров
      const isFirstLoad = !sanitizedParams.cityId && !sanitizedParams.cityName && !sanitizedParams.search && sanitizedParams.page === 1;
      if (isFirstLoad && !allCitiesCache) {
        fetchAllCitiesForFilter().catch(err => {
          console.warn("[best-benefits] Failed to load cities in background:", err);
        });
      }
      
      return result;
    } catch (error) {
      console.error("[best-benefits] Real API fetch failed:", error);
      // Fallback to sample data if real API fails
      const fallbackData = await fetchFromSample();
      return await normalizeResponse(fallbackData, sanitizedParams, { source: "fallback", fetchedAt: new Date().toISOString() });
    }
  }

  // Use sample data by default (for testing)
  // console.log("[best-benefits] Using sample data (USE_REAL_BB_API not enabled)");
  const fallbackData = await fetchFromSample();
  return await normalizeResponse(fallbackData, sanitizedParams, { source: "fallback", fetchedAt: new Date().toISOString() });
}

async function fetchFromRemote(params: DiscountSearchParams): Promise<BestBenefitsResponse> {
  if (!API_BASE_URL) {
    throw new Error("BestBenefits API url is not defined");
  }

  // Get authentication token
  const token = await getBestBenefitsToken();

  // Если запрашиваются конкретные скидки по IDs (для favorites/claimed)
  if (params.ids) {
    const idList = params.ids.split(",").map(id => id.trim()).filter(Boolean);
    
    // Если один ID - запрашиваем через /products/{id}
    if (idList.length === 1) {
      try {
        const singleUrl = `${API_BASE_URL}/${idList[0]}`;
        // console.log("[best-benefits] Fetching single discount from API:", singleUrl);
        
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
          const discount = singleData.data || singleData;
          if (discount) {
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
        }
      } catch (error) {
        console.warn("[best-benefits] Error fetching single discount:", error);
      }
    }
    
    // Если несколько IDs - запрашиваем каждую скидку по отдельности и собираем результаты
    // Это нужно для корректной работы favorites/claimed views
    if (idList.length > 1) {
      console.log(`[best-benefits] Fetching ${idList.length} discounts by IDs for filtered view`);
      const discounts: any[] = [];
      
      // Загружаем все скидки параллельно (максимум 10 одновременно для избежания перегрузки)
      const batchSize = 10;
      for (let i = 0; i < idList.length; i += batchSize) {
        const batch = idList.slice(i, i + batchSize);
        const batchPromises = batch.map(async (id) => {
          try {
            const url = `${API_BASE_URL}/${id}`;
            const response = await fetch(url, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
              cache: "no-store",
            });
            
            if (response.ok) {
              const data = await response.json();
              return data.data || data;
            }
            return null;
          } catch (error) {
            console.warn(`[best-benefits] Failed to fetch discount ${id}:`, error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        discounts.push(...batchResults.filter(Boolean));
      }
      
      console.log(`[best-benefits] Fetched ${discounts.length} out of ${idList.length} requested discounts`);
      
      return {
        data: discounts,
        meta: {
          total: discounts.length,
          per_page: discounts.length,
          current_page: 1,
          last_page: 1,
        },
      } as BestBenefitsResponse;
    }
  }

  // Если есть поисковый запрос, используем /search endpoint
  if (params.search && params.search.trim().length > 0) {
    const searchUrl = "https://bestbenefits.ru/api/search";
    const searchParams = new URLSearchParams();
    searchParams.set("query", params.search.trim());
    
    // ⚠️ НЕ применяем фильтр по городу при поиске
    // API поиска вернет все релевантные скидки, включая глобальные
    // Фильтрация по городу (если нужна) произойдет на клиенте
    // if (params.cityName) {
    //   searchParams.set("city", params.cityName);
    // }
    
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("per_page", String(params.limit));

    const url = `${searchUrl}?${searchParams.toString()}`;
    console.log("[best-benefits] Using /search endpoint:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (response.ok) {
      const data = (await response.json()) as BestBenefitsResponse;
      console.log("[best-benefits] Search результаты:", {
        query: params.search,
        found: data?.data?.length ?? 0,
        total: data?.meta?.total,
        page: data?.meta?.current_page,
        lastPage: data?.meta?.last_page,
        hasMore: data?.meta?.current_page && data?.meta?.last_page 
          ? data?.meta?.current_page < data?.meta?.last_page 
          : false,
      });
      return data;
    } else {
      console.warn("[best-benefits] /search endpoint failed, falling back to /products");
    }
  }

  // Используем /products endpoint с правильными параметрами
  // ВАЖНО: BestBenefits API НЕ поддерживает фильтрацию по регионам
  // API поддерживает только:
  // - category (ID категории, один параметр, не массив)
  // - city (название города, строка, не ID)
  // Фильтрация по регионам делается на клиенте
  const searchParams = new URLSearchParams();
  
  // API поддерживает только один category (не массив)
  if (params.categoryIds && params.categoryIds.length > 0) {
    // Берем первую категорию (API не поддерживает множественный выбор)
    searchParams.set("category", String(params.categoryIds[0]));
  }
  
  // API принимает название города (строка), а не ID
  if (params.cityName) {
    searchParams.set("city", params.cityName);
  }
  
  // Пагинация
  if (params.limit) searchParams.set("per_page", String(params.limit));
  if (params.page) searchParams.set("page", String(params.page));

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
  // console.log("[best-benefits] Fetched", data?.data?.length ?? 0, "discounts from API");
  
  // Логируем первый элемент для проверки наличия описания (закомментировано для production)
  // if (data?.data?.length > 0) {
  //   const first = data.data[0];
  //   console.log("[best-benefits] Sample discount fields:", {
  //     id: first.id,
  //     hasDescription: !!first.description,
  //     descriptionLength: first.description?.length || 0,
  //     hasShortDescription: !!first.short_description,
  //     shortDescriptionLength: first.short_description?.length || 0,
  //     hasPromoCode: !!first.promo_code,
  //     promoCode: first.promo_code,
  //   });
  // }
  
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

async function normalizeResponse(
  raw: BestBenefitsResponse,
  params: DiscountSearchParams,
  context: FetchContext
): Promise<DiscountSearchResult> {
  const rawDiscounts = raw?.data ?? [];

  const discounts: DiscountItem[] = rawDiscounts.map((discount) => normalizeDiscount(discount));
  
  // Извлекаем категории из ВСЕХ загруженных скидок (до фильтрации)
  const allCategories = extractCategories(discounts);
  
  // ⚠️ Для городов: если это поиск, используем полный кэшированный список всех городов,
  // а не только города из результатов поиска (т.к. поиск может вернуть глобальные скидки без городов)
  let allCities: DiscountCity[];
  if (params.search && USE_REAL_API) {
    // При поиске берем ВСЕ города из кэша, чтобы фильтр показывал правильные счетчики
    try {
      allCities = await fetchAllCitiesForFilter();
    } catch (error) {
      console.warn("[best-benefits] Failed to fetch cached cities for search, using cities from results:", error);
      allCities = extractCities(discounts);
    }
  } else {
    // Для обычных запросов берем города из текущих результатов
    allCities = extractCities(discounts);
  }
  
  // Apply all filters for fallback data
  let filtered = discounts;
  
  // Filter by city - ВАЖНО: фильтруем строго по ID города + включаем глобальные скидки
  // ⚠️ НЕ фильтруем по городу, если это поиск - показываем все результаты
  if (params.cityId && !params.search) {
    // Находим название выбранного города для логирования
    const selectedCityName = discounts
      .flatMap(d => d.cities)
      .find(c => c.id === params.cityId)?.name || `ID:${params.cityId}`;
    
    const globalDiscounts = discounts.filter(d => d.cities.length === 0).length;
    const citySpecificDiscounts = discounts.filter(d => d.cities.length > 0).length;
    
    // console.log(`[best-benefits] 🔍 Filtering by cityId: ${params.cityId} (${selectedCityName})`);
    // console.log(`[best-benefits] 📊 Before filter: ${discounts.length} discounts (${globalDiscounts} global, ${citySpecificDiscounts} city-specific)`);
    
    filtered = filtered.filter((discount) => {
      // Если у скидки нет городов - она доступна везде (глобальная)
      if (discount.cities.length === 0) {
        // console.log(`[best-benefits] 🌍 Discount ${discount.id} "${discount.title}" INCLUDED (global discount, no cities)`);
        return true;
      }
      
      // Иначе проверяем наличие выбранного города
      const cityIds = discount.cities.map(c => c.id);
      const cityNames = discount.cities.map(c => c.name);
      const hasCity = cityIds.includes(params.cityId!);
      
      // if (hasCity) {
      //   console.log(`[best-benefits] ✅ Discount ${discount.id} "${discount.title}" INCLUDED. Cities: ${cityNames.join(', ')} (IDs: ${cityIds.join(', ')})`);
      // } else {
      //   console.log(`[best-benefits] ❌ Discount ${discount.id} "${discount.title}" FILTERED OUT. Cities: ${cityNames.join(', ')} (IDs: ${cityIds.join(', ')})`);
      // }
      
      return hasCity;
    });
    
    // console.log(`[best-benefits] 📊 After city filter: ${filtered.length} discounts (was ${discounts.length})`);
    
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
  
  // Filter by search - только для локальных данных (fallback)
  // Если данные пришли из remote API с поиском, то API уже выполнил поиск
  if (params.search && context.source !== "remote") {
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

  // Используем города и категории из всех загруженных скидок (извлечены выше, до фильтрации)
  const categories = allCategories;
  const cities = allCities;

  // Если данные пришли из реального API
  if (context.source === "remote" && raw.meta) {
    // Если запрашивались конкретные IDs (favorites/claimed), делаем клиентскую пагинацию
    // потому что все скидки уже загружены, нужно только разбить на страницы
    if (params.ids) {
      const paginated = paginate(filteredByView, params.page ?? 1, params.limit ?? 15);
      console.log(`[best-benefits] Client-side pagination for IDs: page ${paginated.page}, showing ${paginated.items.length} of ${filteredByView.length} total`);
      
      return {
        discounts: paginated.items,
        categories,
        cities: attachCoordinatesToCities(cities),
        meta: {
          total: filteredByView.length,
          page: paginated.page,
          perPage: paginated.perPage,
          hasMore: paginated.hasMore,
        },
        fetchedAt: context.fetchedAt,
        source: context.source,
      };
    }
    
    // Для обычных запросов используем метаданные из API
    // API уже отпагинировал данные, но мы можем применить дополнительные клиентские фильтры
    return {
      discounts: filteredByView,
      categories,
      cities: attachCoordinatesToCities(cities),
      meta: {
        total: raw.meta.total ?? filteredByView.length,
        page: raw.meta.current_page ?? params.page ?? 1,
        perPage: raw.meta.per_page ?? params.limit ?? 15,
        hasMore: raw.meta.current_page && raw.meta.last_page 
          ? raw.meta.current_page < raw.meta.last_page 
          : false,
      },
      fetchedAt: context.fetchedAt,
      source: context.source,
    };
  } else {
    // Клиентская пагинация для fallback данных
    const paginated = paginate(filteredByView, params.page ?? 1, params.limit ?? filteredByView.length);
    
    return {
      discounts: paginated.items,
      categories,
      cities: attachCoordinatesToCities(cities),
      meta: {
        total: filteredByView.length,
        page: paginated.page,
        perPage: paginated.perPage,
        hasMore: paginated.hasMore,
      },
      fetchedAt: context.fetchedAt,
      source: context.source,
    };
  }
}

function paginate<T>(items: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const paginatedItems = items.slice(start, end);
  return {
    items: paginatedItems,
    page,
    perPage,
    hasMore: end < items.length, // Есть ли еще элементы после текущей страницы
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

  // Включаем ВСЕ города из API (не фильтруем)
  const cityList: DiscountCity[] = (discount.cities ?? [])
    .filter((city) => city.name && city.name.trim().length > 0) // Только непустые названия
    .map((city) => ({
      id: city.id,
      name: city.name,
      coordinates: getCityCoordinates(city.name),
    }));

  // Используем description и shortDescription как есть из API
  // НЕ удаляем их - пусть отображаются в блоке "Города" отдельно
  const description = discount.description || null;
  const shortDescription = discount.short_description || null;
  
  // console.log(`[best-benefits] Discount ${discount.id} "${discount.name}":`, {
  //   hasPromoCode: !!discount.promo_code,
  //   promoCode: discount.promo_code,
  //   hasDescription: !!description,
  //   descriptionLength: description?.length || 0,
  //   hasShortDescription: !!shortDescription,
  //   shortDescriptionLength: shortDescription?.length || 0,
  //   hasCtaUrl: !!discount.cta_url,
  //   ctaUrl: discount.cta_url,
  // });

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
  
  // Собираем ВСЕ уникальные города из скидок (включая города из других стран)
  discounts.forEach((discount) => {
    discount.cities.forEach((city) => {
      if (city.name && city.name.trim().length > 0) {
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

