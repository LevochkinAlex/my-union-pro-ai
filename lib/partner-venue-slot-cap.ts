/** Лимит заявок/мест задан (1–999). null/прочее — «Неограничено». */
export function partnerVenueHasApplicationSlotCap(cap: unknown): cap is number {
  return typeof cap === "number" && Number.isInteger(cap) && cap >= 1 && cap <= 999;
}
