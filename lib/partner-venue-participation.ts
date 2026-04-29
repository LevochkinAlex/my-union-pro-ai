/** Совпадает с Prisma enum `PartnerVenueParticipationMode`. */
export const PARTNER_VENUE_PARTICIPATION_OPTIONS = [
  { value: "PROMO_CODE", label: "По промокоду" },
  { value: "APPLICATION", label: "По заявке" },
] as const;

export type PartnerVenueParticipationValue =
  (typeof PARTNER_VENUE_PARTICIPATION_OPTIONS)[number]["value"];

export function isPartnerVenueParticipationValue(v: string): v is PartnerVenueParticipationValue {
  return v === "PROMO_CODE" || v === "APPLICATION";
}

export function partnerVenueParticipationLabel(
  mode: string | null | undefined
): string {
  if (mode === "APPLICATION") return "По заявке";
  return "По промокоду";
}
