import type { Prisma } from "@prisma/client";

/**
 * Поля `PartnerVenue` для партнёрского API (список / карточка).
 * Не включаем `slaOverdueBlockEmailSentAt`, чтобы `findMany` / `findFirst` работали,
 * пока на базе не применена миграция `partner_venue_application_sla` (иначе Prisma
 * генерирует SELECT по всем колонкам схемы и PostgreSQL падает с «column does not exist»).
 */
export const partnerVenuePartnerApiSelect = {
  id: true,
  partnerId: true,
  name: true,
  description: true,
  address: true,
  city: true,
  website: true,
  phone: true,
  email: true,
  bannerUrl: true,
  bannerAlt: true,
  promoCode: true,
  promoLabel: true,
  conditions: true,
  eventAt: true,
  participationMode: true,
  remainingSlots: true,
  serviceCategoryCode: true,
  serviceCode: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PartnerVenueSelect;
