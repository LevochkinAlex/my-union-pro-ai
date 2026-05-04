import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DiscountItem } from "@/types/discounts";
import {
  mapPartnerVenuesToDiscountItems,
  type PartnerVenueCardSource,
} from "@/lib/partner-venue-discount-mapper";
import { getPartnerVenueIdsSlaOverdueFromCatalog } from "@/lib/partner-venue-sla";

/**
 * Загружает активные одобренные площадки для SSR каталога скидок
 * (тот же фильтр, что у GET /api/partner-venues/public).
 */
export async function fetchPartnerVenuesForDiscountCatalog(options?: {
  search?: string;
  limit?: number;
}): Promise<DiscountItem[]> {
  const search = options?.search?.trim() ?? "";
  const limit = Math.min(200, Math.max(1, options?.limit ?? 200));

  const where: Prisma.PartnerVenueWhereInput = {
    isActive: true,
    partner: {
      isActive: true,
      moderationStatus: "APPROVED",
      moderationApprovedAt: { not: null },
    },
  };

  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const ilike = (field: string, value: string) => ({
        [field]: { contains: value, mode: "insensitive" as const },
      });
      const orForWord = (word: string) => ({
        OR: [
          ilike("name", word),
          ilike("description", word),
          ilike("promoLabel", word),
          { partner: ilike("name", word) },
        ],
      });
      where.AND = words.map((w) => orForWord(w));
    }
  }

  const slaHiddenIds = await getPartnerVenueIdsSlaOverdueFromCatalog();
  if (slaHiddenIds.length > 0) {
    where.id = { notIn: slaHiddenIds };
  }

  const venues = await prisma.partnerVenue.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      partner: {
        select: {
          id: true,
          name: true,
          description: true,
          website: true,
          logoUrl: true,
        },
      },
    },
  });

  return mapPartnerVenuesToDiscountItems(venues as PartnerVenueCardSource[]);
}
