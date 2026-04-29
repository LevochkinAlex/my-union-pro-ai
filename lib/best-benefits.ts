import fs from "fs/promises";
import path from "path";
import {
  BestBenefitsDiscount,
  BestBenefitsResponse,
  DiscountCategory,
  DiscountCity,
  DiscountItem,
  DiscountOption,
  DiscountSearchParams,
  DiscountSearchResult,
} from "@/types/discounts";
import { attachCoordinatesToCities, calculateDistanceKm, getCityCoordinates } from "@/lib/geo";
import { getBestBenefitsToken } from "@/lib/best-benefits-auth";
import { getAllRussianCities } from "@/lib/constants/russian-regions";
import { getDiscountsFromLocalDB, getDiscountsSupplementForSearch } from "@/lib/fetch-discounts-from-db";
import { coalesceBestBenefitsDescriptions } from "@/lib/best-benefits-description";
import { resolveBestBenefitsCatalogProductsUrl } from "@/lib/best-benefits-catalog-url";
import { bestBenefitsSearchQueryVariants, normalizeDiscountSearchInput } from "@/lib/discount-search-query";

const SAMPLE_FILE = path.join(process.cwd(), "public", "best_benefits", "sample-discounts.json");
const USE_REAL_API = process.env.USE_REAL_BB_API === "true";

type FetchContext = {
  source: "remote" | "fallback";
  fetchedAt: string;
};

// Кэш для всех городов (чтобы не загружать их каждый раз)
let allCitiesCache: DiscountCity[] | null = null;
let allCitiesCacheTimestamp: number = 0;
const ALL_CITIES_CACHE_TTL = 30 * 60 * 1000; // 30 минут — справочник городов меняется редко
let citiesLoadingPromise: Promise<DiscountCity[]> | null = null;

const BB_CITIES_API = "https://bestbenefits.ru/api/cities";

/**
 * Парсит тело ответа BB как JSON. При HTML (ошибка, редирект, WAF) не бросает SyntaxError —
 * возвращает null, чтобы верхний код мог сделать fallback.
 */
async function parseBbResponseJson<T>(response: Response, context: string): Promise<T | null> {
  const raw = await response.text();
  const trimmed = raw.trimStart();
  if (!trimmed) {
    console.warn(`[best-benefits] ${context}: empty body`);
    return null;
  }
  if (trimmed.startsWith("<")) {
    console.warn(
      `[best-benefits] ${context}: expected JSON, got HTML`,
      trimmed.slice(0, 160).replace(/\s+/g, " ")
    );
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[best-benefits] ${context}: JSON.parse failed`, e);
    return null;
  }
}

/**
 * Загружает полный справочник городов из BB /api/cities.
 * BB пагинирует по 40 записей, всего ~1167 городов (~30 страниц).
 */
async function fetchAllCitiesForFilter(): Promise<DiscountCity[]> {
  if (allCitiesCache && Date.now() - allCitiesCacheTimestamp < ALL_CITIES_CACHE_TTL) {
    return allCitiesCache;
  }

  if (citiesLoadingPromise) {
    return citiesLoadingPromise;
  }

  if (!USE_REAL_API) {
    return [];
  }

  citiesLoadingPromise = (async () => {
    try {
      const token = await getBestBenefitsToken();
      const citiesMap = new Map<number, DiscountCity>();
      let page = 1;

      while (true) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);

        let response: Response;
        try {
          response = await fetch(`${BB_CITIES_API}?page=${page}&per_page=100`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(tid);
        } catch (err: unknown) {
          clearTimeout(tid);
          if (err instanceof Error && err.name === "AbortError") {
            console.warn(`[best-benefits] /api/cities timeout on page ${page}`);
            break;
          }
          throw err;
        }

        if (!response.ok) {
          console.warn(`[best-benefits] /api/cities page ${page} returned ${response.status}`);
          break;
        }

        const json = await parseBbResponseJson<{
          data?: unknown;
          meta?: { current_page?: number; last_page?: number };
        }>(response, `/api/cities page ${page}`);
        if (!json) break;
        const rawItems =
          json.data !== undefined && json.data !== null ? json.data : json;
        const items: unknown[] = Array.isArray(rawItems) ? rawItems : [];
        if (items.length === 0) break;

        for (const c of items) {
          const row = c as { id?: number; name?: string; slug?: string | null };
          if (row.id && row.name && row.name.trim()) {
            citiesMap.set(row.id, {
              id: row.id,
              name: row.name.trim(),
              slug: row.slug ?? null,
              coordinates: getCityCoordinates(row.name),
            });
          }
        }

        const meta = json.meta;
        if (meta?.current_page && meta?.last_page && meta.current_page >= meta.last_page) break;
        if (!meta && items.length < 40) break;
        page++;
      }

      const cities = Array.from(citiesMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "ru-RU")
      );

      allCitiesCache = cities;
      allCitiesCacheTimestamp = Date.now();
      citiesLoadingPromise = null;

      console.log(`[best-benefits] Loaded ${cities.length} cities from /api/cities (${page} pages)`);
      return cities;
    } catch (error) {
      citiesLoadingPromise = null;
      console.error("[best-benefits] Failed to fetch cities:", error);
      return [];
    }
  })();

  return citiesLoadingPromise;
}

export async function fetchBestBenefitsDiscounts(
  params: DiscountSearchParams = {}
): Promise<DiscountSearchResult> {
  // При выборе города запрашиваем больше скидок за раз, иначе API может отдавать только 20 и hasMore=false
  const baseLimit = params.limit ?? 20;
  const limitWhenCity = Math.min(100, Math.max(baseLimit, 50));
  const normalizedSearch =
    params.search?.trim()?.length
      ? normalizeDiscountSearchInput(params.search as string)
      : undefined;
  const hasSearch = Boolean(normalizedSearch);
  const sanitizedParams = {
    ...params,
    search: normalizedSearch,
    // Поиск в BB часто даёт неполную выдачу; запрашиваем больше строк + дополняем из локальной БД
    limit: hasSearch
      ? Math.min(100, Math.max(baseLimit, 50))
      : (params.cityId || params.cityName) && !hasSearch
        ? limitWhenCity
        : baseLimit,
    page: params.page ?? 1,
  };

  // Если передан cityId, но нет cityName, нужно получить название города.
  // Без cityName BB API возвращает общий список, и дальнейшая локальная фильтрация
  // дает "рваные" страницы/total. Поэтому при необходимости догружаем справочник городов заранее.
  if (USE_REAL_API && sanitizedParams.cityId && !sanitizedParams.cityName) {
    if (allCitiesCache) {
      // Используем кэш, если он есть
      const city = allCitiesCache.find(c => c.id === sanitizedParams.cityId);
      if (city?.name) {
        sanitizedParams.cityName = city.name;
        // console.log(`[best-benefits] Found city name for ID ${sanitizedParams.cityId} from cache: ${city.name}`);
      }
    }
    // Если кэша нет/город не найден — загружаем города синхронно, чтобы отправить в BB корректный city.
    if (!sanitizedParams.cityName) {
      try {
        const cities = await fetchAllCitiesForFilter();
        const city = cities.find((c) => c.id === sanitizedParams.cityId);
        if (city?.name) {
          sanitizedParams.cityName = city.name;
        }
      } catch (error) {
        console.warn("[best-benefits] Failed to resolve cityName by cityId before request:", error);
      }
    }
  }

  // Use real API if configured
  if (USE_REAL_API) {
    try {
      // Загрузка скидок и справочника городов параллельно.
      // Справочник берётся из /api/cities (полный — ~1167 записей), а не из продуктов.
      const [remoteData, fullCities] = await Promise.all([
        fetchFromRemote(sanitizedParams),
        fetchAllCitiesForFilter().catch((err) => {
          console.warn("[best-benefits] Failed to load cities:", err);
          return [] as DiscountCity[];
        }),
      ]);

      let mergedRemote: BestBenefitsResponse = remoteData;
      if (hasSearch) {
        try {
          const remoteRows = mergedRemote.data ?? [];
          const remoteIds = remoteRows.map((d: BestBenefitsDiscount) => Number(d.id)).filter(Number.isFinite);
          const slots = Math.max(0, 100 - remoteRows.length);
          const extras = await getDiscountsSupplementForSearch(
            sanitizedParams.search!.trim(),
            remoteIds,
            slots
          );
          if (extras.length > 0) {
            mergedRemote = {
              ...mergedRemote,
              data: [...remoteRows, ...extras.map(localDiscountItemToBbRaw)],
              meta: mergedRemote.meta
                ? {
                    ...mergedRemote.meta,
                    total: Math.max(
                      mergedRemote.meta.total ?? 0,
                      remoteRows.length + extras.length
                    ),
                  }
                : mergedRemote.meta,
            };
            console.log("[best-benefits] Search supplement from local DB:", {
              query: sanitizedParams.search,
              remoteCount: remoteRows.length,
              added: extras.length,
            });
          }
        } catch (supErr) {
          console.warn("[best-benefits] Local search supplement failed:", supErr);
        }
      }

      const result = await normalizeResponse(mergedRemote, sanitizedParams, { source: "remote", fetchedAt: new Date().toISOString() });

      // Подставляем полный справочник городов из /api/cities
      if (fullCities.length > 0) {
        result.cities = fullCities;
      }
      
      return result;
    } catch (error) {
      console.warn("[best-benefits] Real API fetch failed, using fallback:", error);
      // Fallback 1: попробовать локальную БД (каталог от крона sync-discounts)
      try {
        const localResult = await getDiscountsFromLocalDB(sanitizedParams);
        if (localResult && localResult.discounts.length > 0) {
          return {
            ...localResult,
            cities: attachCoordinatesToCities(localResult.cities),
          };
        }
      } catch (localErr) {
        console.warn("[best-benefits] Local DB fallback failed:", localErr);
      }
      // Fallback 2: sample data
      const fallbackData = await fetchFromSample();
      return await normalizeResponse(fallbackData, sanitizedParams, { source: "fallback", fetchedAt: new Date().toISOString() });
    }
  }

  // USE_REAL_BB_API не включён: пробуем локальную БД (каталог от крона), затем sample
  try {
    const localResult = await getDiscountsFromLocalDB(sanitizedParams);
    if (localResult && localResult.discounts.length > 0) {
      return {
        ...localResult,
        cities: attachCoordinatesToCities(localResult.cities),
      };
    }
  } catch (localErr) {
    console.warn("[best-benefits] Local DB fallback (no real API) failed:", localErr);
  }
  const fallbackData = await fetchFromSample();
  return await normalizeResponse(fallbackData, sanitizedParams, { source: "fallback", fetchedAt: new Date().toISOString() });
}

/** Преобразует запись из локальной БД в сырой объект BB для normalizeDiscount */
function localDiscountItemToBbRaw(d: DiscountItem): BestBenefitsDiscount {
  return {
    id: d.id,
    name: d.title,
    description: d.description ?? undefined,
    short_description: d.shortDescription ?? undefined,
    discount_value: d.discountValue ?? undefined,
    promo_code: d.promoCode ?? undefined,
    cta_url: d.partnerUrl ?? undefined,
    image_url: d.imageUrl ?? undefined,
    tags: d.tags?.length ? d.tags : undefined,
    isPremium: d.isPremium,
    categories: d.categories?.length
      ? d.categories.map((c) => ({ id: c.id, name: c.name, order: c.order ?? undefined }))
      : undefined,
    main_category: d.mainCategory
      ? { id: d.mainCategory.id, name: d.mainCategory.name, order: d.mainCategory.order ?? undefined }
      : undefined,
    cities:
      d.cities?.filter((c) => c.id !== 0 && c.name?.trim()).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? undefined,
      })) ?? undefined,
    updated_at: d.updatedAt ?? undefined,
    end: d.validUntil ?? undefined,
    options: d.options?.length ? d.options : undefined,
  };
}

/** Объединяет ответы /api/search по нескольким query без дубликатов id. */
function mergeBbSearchResponses(parts: BestBenefitsResponse[]): BestBenefitsResponse {
  const byId = new Map<number, unknown>();
  let maxTotal = 0;
  for (const r of parts) {
    for (const d of r.data ?? []) {
      const id = Number((d as unknown as { id?: unknown }).id);
      if (!Number.isFinite(id)) continue;
      if (!byId.has(id)) byId.set(id, d);
    }
    const t = r.meta?.total;
    if (typeof t === "number" && Number.isFinite(t)) maxTotal = Math.max(maxTotal, t);
  }
  const data = [...byId.values()] as BestBenefitsDiscount[];
  const m0 = parts[0]?.meta;
  return {
    data,
    meta: {
      ...m0,
      total: Math.max(maxTotal, data.length),
      per_page: m0?.per_page ?? data.length,
      current_page: m0?.current_page ?? 1,
      last_page: m0?.last_page ?? 1,
    },
  } as BestBenefitsResponse;
}

async function fetchBestBenefitsSearchOne(
  token: string,
  queryText: string,
  params: DiscountSearchParams
): Promise<BestBenefitsResponse | null> {
  const searchUrl = "https://bestbenefits.ru/api/search";
  const searchParams = new URLSearchParams();
  searchParams.set("query", queryText);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("per_page", String(params.limit));
  const url = `${searchUrl}?${searchParams.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[best-benefits] /search HTTP ${response.status}`, { query: queryText });
      return null;
    }
    return await parseBbResponseJson<BestBenefitsResponse>(
      response,
      `/search query=${JSON.stringify(queryText)}`
    );
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`[best-benefits] /search aborted/timeout`, { query: queryText });
      return null;
    }
    console.warn(`[best-benefits] /search request failed`, { query: queryText, error });
    return null;
  }
}

async function fetchFromRemote(params: DiscountSearchParams): Promise<BestBenefitsResponse> {
  const catalogBase = resolveBestBenefitsCatalogProductsUrl();

  // Get authentication token
  const token = await getBestBenefitsToken();

  // Если запрашиваются конкретные скидки по IDs (для favorites/claimed)
  if (params.ids) {
    const idList = params.ids.split(",").map(id => id.trim()).filter(Boolean);
    
    // Если один ID - запрашиваем через /products/{id}
    if (idList.length === 1) {
      try {
        const singleUrl = `${catalogBase}/${idList[0]}`;
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
          const singleData = await parseBbResponseJson<Record<string, unknown>>(
            singleResponse,
            `GET product ${idList[0]}`
          );
          if (!singleData) {
            console.warn(`[best-benefits] Single product ${idList[0]}: non-JSON body, trying local DB`);
          } else {
            const discount =
              (singleData as { data?: unknown }).data !== undefined
                ? (singleData as { data: unknown }).data
                : singleData;
            const list = Array.isArray(discount) ? discount : discount ? [discount] : [];
            if (list.length > 0) {
              return {
                data: list,
                meta: {
                  total: list.length,
                  per_page: list.length,
                  current_page: 1,
                  last_page: 1,
                },
              } as BestBenefitsResponse;
            }
          }
        } else {
          console.warn(
            `[best-benefits] Single product ${idList[0]} → HTTP ${singleResponse.status}, trying local DB`
          );
        }
      } catch (error) {
        console.warn("[best-benefits] Error fetching single discount:", error);
      }

      // BB часто не отдаёт /products/{id} сервисному токену; общий /products может не содержать id на первой странице.
      try {
        const local = await getDiscountsFromLocalDB({
          ids: String(idList[0]),
          page: 1,
          limit: 5,
        });
        if (local?.discounts?.length) {
          console.log(
            `[best-benefits] Single id ${idList[0]} loaded from local DB (${local.discounts.length} row(s))`
          );
          return {
            data: local.discounts.map(localDiscountItemToBbRaw),
            meta: {
              total: local.discounts.length,
              per_page: local.discounts.length,
              current_page: 1,
              last_page: 1,
            },
          } as BestBenefitsResponse;
        }
      } catch (locErr) {
        console.warn("[best-benefits] Local DB fallback for single product id failed:", locErr);
      }
    }
    
    // Если несколько IDs - запрашиваем каждую скидку по отдельности и собираем результаты
    // Это нужно для корректной работы favorites/claimed views
    if (idList.length > 1) {
      console.log(`[best-benefits] Fetching ${idList.length} discounts by IDs for filtered view`);
      const discounts: BestBenefitsDiscount[] = [];
      
      // Загружаем все скидки параллельно (максимум 10 одновременно для избежания перегрузки)
      const batchSize = 10;
      for (let i = 0; i < idList.length; i += batchSize) {
        const batch = idList.slice(i, i + batchSize);
        const batchPromises = batch.map(async (id) => {
          try {
            const url = `${catalogBase}/${id}`;
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
              const parsed = await parseBbResponseJson<{ data?: unknown }>(
                response,
                `GET ${catalogBase.replace(/\/$/, "")}/${id}`
              );
              if (!parsed) return null;
              const body =
                (parsed as { data?: unknown }).data !== undefined
                  ? (parsed as { data: unknown }).data
                  : parsed;
              return body as BestBenefitsDiscount;
            }
            return null;
          } catch (error) {
            console.warn(`[best-benefits] Failed to fetch discount ${id}:`, error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        discounts.push(...batchResults.filter((x): x is BestBenefitsDiscount => x != null));
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

  // Если есть поисковый запрос — несколько вариантов query (с пробелами и слитно), ответы сливаем.
  if (params.search && params.search.trim().length > 0) {
    try {
      const variants = bestBenefitsSearchQueryVariants(params.search);
      console.log("[best-benefits] /search variants:", variants);

      const settled = await Promise.allSettled(
        variants.map((q) => fetchBestBenefitsSearchOne(token, q, params))
      );

      const ok: BestBenefitsResponse[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled" && s.value) ok.push(s.value);
      }

      const allRejected = settled.every((s) => s.status === "rejected");
      const allTimeout = settled.every(
        (s) =>
          s.status === "rejected" &&
          (s.reason?.name === "AbortError" ||
            String((s.reason as Error)?.message ?? "").toLowerCase().includes("timeout"))
      );

      if (ok.length > 0) {
        const merged = ok.length === 1 ? ok[0] : mergeBbSearchResponses(ok);
        const n = merged.data?.length ?? 0;
        console.log("[best-benefits] Search merged:", {
          queries: variants,
          found: n,
          total: merged.meta?.total,
        });
        if (n > 0) {
          return merged;
        }
      }

      if (allRejected && allTimeout) {
        console.warn("[best-benefits] /search all variants timed out, falling back to /products");
      }
    } catch (error: unknown) {
      console.warn("[best-benefits] /search block error, falling back to /products:", error);
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

  const url = `${catalogBase}?${searchParams.toString()}`;
  console.log("[best-benefits] Fetching from API:", url);

  // Добавляем таймаут для основного запроса к /products
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд таймаут
  
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      // Disable caching to avoid "item over 2MB" errors
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after 15s: ${url}`);
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    // В dev-режиме console.error отображается как "Issue" в оверлее Next.js.
    // Для ожидаемых сетевых/авторизационных ошибок используем warn и fallback выше по стеку.
    console.warn("[best-benefits] API error:", response.status, errorText);
    throw new Error(`BestBenefits API responded with ${response.status}: ${errorText}`);
  }

  const data = await parseBbResponseJson<BestBenefitsResponse>(
    response,
    `/products GET ${catalogBase}`
  );
  if (!data) {
    console.warn("[best-benefits] API returned success but body was not JSON, treating as failure");
    throw new Error(`BestBenefits API returned non-JSON body for ${url}`);
  }
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
  
  // Города для фильтра: берём из скидок текущей выдачи (позже перезаписываются полным справочником из /api/cities в fetchBestBenefitsDiscounts)
  const allCities: DiscountCity[] = extractCities(discounts);
  
  // Apply all filters for fallback data
  let filtered = discounts;
  
  // Filter by city (fallback): применяем локально ТОЛЬКО когда не удалось передать cityName в BB API.
  // Если cityName уже есть, сервер BB сам фильтрует корректно и возвращает согласованную pagination/meta.
  // ⚠️ НЕ фильтруем по городу при поиске - показываем все результаты поиска.
  // ⚠️ НЕ фильтруем по городу при запросе конкретных ids (карточка детали / избранное) — иначе скидка «пропадает».
  const hasIdLookup =
    typeof params.ids === "string" &&
    params.ids
      .split(",")
      .map((s) => s.trim())
      .some((s) => s.length > 0);
  if (params.cityId && !params.search && !params.cityName && !hasIdLookup) {
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
      // Для fallback/sample: чтобы не показывать "Нет предложений", показываем все скидки
      if (context.source === "fallback") {
        filtered = discounts;
      }
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
  
  // Filter by expiration date - скрываем скидки с истекшим сроком действия
  const now = new Date();
  filtered = filtered.filter((discount) => {
    if (!discount.validUntil) {
      // Если дата окончания не указана, показываем скидку
      return true;
    }
    
    try {
      const expirationDate = new Date(discount.validUntil);
      // Сравниваем только даты (без времени), чтобы скидка была видна в последний день действия
      const expirationDateOnly = new Date(expirationDate.getFullYear(), expirationDate.getMonth(), expirationDate.getDate());
      const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Показываем скидку, если дата окончания >= сегодня
      return expirationDateOnly >= nowDateOnly;
    } catch (error) {
      console.warn(`[best-benefits] Failed to parse expiration date for discount ${discount.id}:`, discount.validUntil, error);
      // При ошибке парсинга показываем скидку
      return true;
    }
  });
  
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

  const { description: coalescedDesc, shortDescription: coalescedShort } =
    coalesceBestBenefitsDescriptions(discount as unknown as Record<string, unknown>);
  const description = coalescedDesc;
  const shortDescription = coalescedShort;
  
  // Нормализуем варианты скидки (options)
  const options: DiscountOption[] | undefined = discount.options?.length 
    ? discount.options.map((opt) => ({
        id: opt.id,
        name: opt.name,
      }))
    : undefined;
  
  // Логируем скидки с вариантами
  if (options && options.length > 0) {
    console.log(`[best-benefits] Discount ${discount.id} "${discount.name}" has ${options.length} options:`, 
      options.map(o => `${o.id}: ${o.name}`).join(', ')
    );
  }

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
    options, // Варианты скидки
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

