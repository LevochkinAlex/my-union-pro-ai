import type { PartnerModerationStatus } from "@prisma/client";

/** При открытии карточки админом эти статусы переводим в «На проверке» */
export const PARTNER_STATUSES_NEEDING_ADMIN_REVIEW = ["NEW", "DRAFT", "RETURNED"] as const;

export type PartnerDraftGateFields = {
  moderationStatus?: string | null;
  cabinetInviteSentAt?: string | Date | null;
  cabinetInviteFirstOpenAt?: string | Date | null;
  adminPartnerCardFirstSeenAt?: string | Date | null;
};

function gateTimestampPresent(v: string | Date | null | undefined): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/** Выполнены все условия выхода из «Черновик»: приглашение отправлено, ссылка открыта, админ заходил в карточку */
export function partnerModerationDraftGatesComplete(p: PartnerDraftGateFields): boolean {
  return (
    gateTimestampPresent(p.cabinetInviteSentAt) &&
    gateTimestampPresent(p.cabinetInviteFirstOpenAt) &&
    gateTimestampPresent(p.adminPartnerCardFirstSeenAt)
  );
}

/** Статус «Черновик» и ещё не все условия — нельзя переводить в «На проверке» только заходом админа */
export function partnerModerationShouldStayDraft(p: PartnerDraftGateFields): boolean {
  if (String(p.moderationStatus ?? "").trim() !== "DRAFT") return false;
  return !partnerModerationDraftGatesComplete(p);
}

/** Нужно ли выставить UNDER_REVIEW при заходе админа на редактирование */
export function partnerModerationStatusNeedsAdminReview(
  status: string | null | undefined
): boolean {
  const s =
    status === null || status === undefined || String(status).trim() === ""
      ? "NEW"
      : String(status).trim();
  return (PARTNER_STATUSES_NEEDING_ADMIN_REVIEW as readonly string[]).includes(s);
}

/** «Одобрен» в БД без даты одобрения — не считаем реальным одобрением (наследие старой миграции или ручной правки) */
export function partnerModerationIsApprovedWithoutTimestamp(
  status: string | null | undefined,
  approvedAt: string | Date | null | undefined
): boolean {
  const s = String(status ?? "").trim();
  if (s !== "APPROVED") return false;
  if (approvedAt == null) return true;
  if (typeof approvedAt === "string" && approvedAt.trim() === "") return true;
  return false;
}

const LABELS: Record<PartnerModerationStatus, string> = {
  DRAFT: "Черновик",
  NEW: "Новый",
  UNDER_REVIEW: "На проверке",
  APPROVED: "Одобрен",
  BLOCKED: "Заблокирован",
  RETURNED: "Возвращено на доработку",
};

export function getPartnerModerationStatusLabel(
  status: PartnerModerationStatus | string | null | undefined
): string {
  if (!status || typeof status !== "string") return "—";
  return LABELS[status as PartnerModerationStatus] ?? String(status);
}

/** Классы для бейджа статуса (светлая/тёмная тема) */
export function partnerModerationStatusBadgeClass(
  status: PartnerModerationStatus | string | null | undefined
): string {
  const s = status as PartnerModerationStatus | undefined;
  switch (s) {
    case "APPROVED":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200";
    case "UNDER_REVIEW":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100";
    case "NEW":
      return "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200";
    case "DRAFT":
      return "bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200";
    case "BLOCKED":
      return "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200";
    case "RETURNED":
      return "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200";
    default:
      return "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200";
  }
}
