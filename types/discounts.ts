export interface BestBenefitsCategory {
  id: number;
  order?: number | null;
  name: string;
}

export interface BestBenefitsCity {
  id: number;
  name: string;
  slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface BestBenefitsDiscount {
  id: number;
  parent_id?: number | null;
  name: string;
  short_description?: string | null;
  description?: string | null;
  image_url?: string | null;
  image?: string | null;
  cta_url?: string | null;
  promo_code?: string | null;
  discount_value?: string | null;
  main_category?: BestBenefitsCategory | null;
  categories?: BestBenefitsCategory[] | null;
  cities?: BestBenefitsCity[] | null;
  updated_at?: string | null;
  created_at?: string | null;
  end?: string | null;
  tags?: string[] | null;
  isPremium?: boolean | null;
  isFavorite?: boolean | null;
}

export interface BestBenefitsResponse {
  data: BestBenefitsDiscount[];
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    last_updated?: string;
    [key: string]: any;
  };
}

export interface DiscountCategory {
  id: number;
  name: string;
  order?: number | null;
  count?: number;
}

export interface DiscountCity {
  id: number;
  name: string;
  slug?: string | null;
  coordinates?: {
    lat: number;
    lng: number;
  };
  count?: number;
}

export interface DiscountItem {
  id: number;
  title: string;
  description?: string | null;
  shortDescription?: string | null;
  discountValue?: string | null;
  promoCode?: string | null;
  partnerUrl?: string | null;
  imageUrl?: string | null;
  tags: string[];
  isPremium: boolean;
  categories: DiscountCategory[];
  mainCategory?: DiscountCategory | null;
  cities: DiscountCity[];
  distanceKm?: number | null;
  updatedAt?: string | null;
  validUntil?: string | null;
}

export interface DiscountSearchParams {
  search?: string;
  cityId?: number | null;
  categoryIds?: number[];
  premiumOnly?: boolean;
  page?: number;
  limit?: number;
  nearMe?: boolean;
  radiusKm?: number | null;
  lat?: number | null;
  lng?: number | null;
  view?: "all" | "claimed" | "favorites";
  ids?: string | null;
}

export interface DiscountSearchResult {
  discounts: DiscountItem[];
  categories: DiscountCategory[];
  cities: DiscountCity[];
  meta: {
    total: number;
    page: number;
    perPage: number;
  };
  fetchedAt: string;
  source: "remote" | "fallback";
}

export interface DiscountPreferencePayload {
  pushEnabled?: boolean;
  filters?: {
    cityId?: number | null;
    categoryIds?: number[];
    premiumOnly?: boolean;
    radiusKm?: number | null;
    favorites?: number[];
    claimed?: number[];
    view?: "all" | "claimed" | "favorites";
  };
  geolocation?: {
    lat: number;
    lng: number;
    accuracy?: number | null;
    cityId?: number | null;
  } | null;
}

export interface DiscountPreferenceResponse extends DiscountPreferencePayload {
  updatedAt: string | null;
}

