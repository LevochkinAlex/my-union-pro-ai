import type { DiscountItem } from "@/types/discounts";

/** Площадка из Api `/api/partner-venues/public` или Prisma `findMany` + `partner`. */
export type PartnerVenueCardSource = {
  id: string;
  name: string;
  description?: string | null;
  conditions?: string | null;
  promoLabel?: string | null;
  promoCode?: string | null;
  website?: string | null;
  bannerUrl?: string | null;
  city?: string | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
  serviceCategoryCode?: string | null;
  serviceCode?: string | null;
  partner?: { name?: string | null; logoUrl?: string | null } | null;
};

/** Единое преобразование для каталога скидок (клиент и SSR). */
export function mapPartnerVenuesToDiscountItems(
  venues: PartnerVenueCardSource[]
): DiscountItem[] {
  return venues.map((v, idx) => ({
    id: -(idx + 1),
    title: v.name,
    description: v.conditions || v.description || null,
    shortDescription: v.description || null,
    discountValue: v.promoLabel || null,
    promoCode: v.promoCode || null,
    partnerUrl: v.website || null,
    imageUrl: v.bannerUrl || null,
    tags: [],
    isPremium: false,
    categories: [],
    mainCategory: null,
    cities: v.city ? [{ id: 0, name: v.city }] : [],
    updatedAt:
      v.updatedAt != null
        ? typeof v.updatedAt === "string"
          ? v.updatedAt
          : v.updatedAt.toISOString?.() ?? null
        : v.createdAt != null
          ? typeof v.createdAt === "string"
            ? v.createdAt
            : v.createdAt.toISOString?.() ?? null
          : null,
    validUntil: null,
    isPartnerVenue: true,
    partnerVenueId: v.id,
    partnerName: v.partner?.name ?? null,
    partnerLogoUrl: v.partner?.logoUrl ?? null,
    partnerServiceCategoryCode: v.serviceCategoryCode ?? null,
    partnerServiceCode: v.serviceCode ?? null,
  }));
}
