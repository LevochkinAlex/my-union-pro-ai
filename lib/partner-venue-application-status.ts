/**
 * Значения enum Prisma `PartnerVenueApplicationStatus` без импорта объекта enum из `@prisma/client`:
 * в части бандлов Next/Turbopack именованный экспорт `PartnerVenueApplicationStatus` бывает `undefined`,
 * что ломает сравнения вида `PartnerVenueApplicationStatus.CANCELLED`.
 */
export const PV_APPLICATION_STATUS = {
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  CANCELLED: "CANCELLED",
  APPROVED: "APPROVED",
} as const;
