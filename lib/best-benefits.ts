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

const SAMPLE_FILE = path.join(process.cwd(), "public", "best_benefits", "sample-discounts.json");
const API_BASE_URL = process.env.BEST_BENEFITS_API_URL ?? "https://bestbenefits.ru/api/profsoyuzy/products";
const API_KEY = process.env.BEST_BENEFITS_API_KEY ?? process.env.BEST_BENEFITS_TOKEN ?? "";

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

  try {
    const remoteData = await fetchFromRemote(sanitizedParams);
    return normalizeResponse(remoteData, sanitizedParams, { source: "remote", fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.warn("[best-benefits] Remote fetch failed, fallback to sample data:", error);
    const fallbackData = await fetchFromSample();
    return normalizeResponse(fallbackData, sanitizedParams, { source: "fallback", fetchedAt: new Date().toISOString() });
  }
}

async function fetchFromRemote(params: DiscountSearchParams): Promise<BestBenefitsResponse> {
  if (!API_BASE_URL) {
    throw new Error("BestBenefits API url is not defined");
  }

  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set("search", params.search);
  if (params.cityId) searchParams.set("city_id", String(params.cityId));
  if (params.categoryIds?.length) searchParams.set("category_ids", params.categoryIds.join(","));
  if (params.premiumOnly) searchParams.set("premium", "1");
  if (params.limit) searchParams.set("per_page", String(params.limit));
  if (params.page) searchParams.set("page", String(params.page));

  const response = await fetch(`${API_BASE_URL}?${searchParams.toString()}`, {
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    // Cache for a short period to avoid hitting upstream too often
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`BestBenefits responded with ${response.status}`);
  }

  return (await response.json()) as BestBenefitsResponse;
}

async function fetchFromSample(): Promise<BestBenefitsResponse> {
  const buffer = await fs.readFile(SAMPLE_FILE, "utf-8");
  return JSON.parse(buffer) as BestBenefitsResponse;
}

function normalizeResponse(
  raw: BestBenefitsResponse,
  params: DiscountSearchParams,
  context: FetchContext
): DiscountSearchResult {
  const rawDiscounts = raw?.data ?? [];

  const discounts: DiscountItem[] = rawDiscounts.map((discount) => normalizeDiscount(discount));
  const filteredByRadius = applyGeoFilter(discounts, params);
  const filteredByView = applyViewFilter(filteredByRadius, params);

  const categories = extractCategories(filteredByRadius);
  const cities = extractCities(filteredByRadius);

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

  const cityList: DiscountCity[] = (discount.cities ?? []).map((city) => ({
    id: city.id,
    name: city.name,
    coordinates: getCityCoordinates(city.name),
  }));

  return {
    id: discount.id,
    title: discount.name,
    description: discount.description,
    shortDescription: discount.short_description,
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
  discounts.forEach((discount) => {
    discount.cities.forEach((city) => {
      map.set(city.id, {
        ...city,
        count: (map.get(city.id)?.count ?? 0) + 1,
      });
    });
  });
  return Array.from(map.values()).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
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

