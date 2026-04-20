import type { Session } from "next-auth";

/** Режим кабинета: участник, сотрудник (по роли РПО) или один из председателей */
export const VIEW_MODES = ["MEMBER", "STAFF", "PPO_HEAD", "MPO_HEAD", "RPO_HEAD"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export interface ViewModeOption {
  mode: string;
  label: string;
  organizationName?: string;
}

/** Поля сессии, связанные с режимом и правами председателей */
export type SessionUserView = Pick<
  NonNullable<Session["user"]>,
  | "role"
  | "viewMode"
  | "isPPOHead"
  | "ppoHeadOrganizationId"
  | "isMPOHead"
  | "mpoHeadOrganizationId"
  | "isRPOHead"
  | "rpoHeadOrganizationId"
>;

/**
 * Текущий режим кабинета из сессии.
 * Единственный источник правды для UI и проверок.
 */
export function getViewMode(session: Session | null): string {
  if (!session?.user) return "MEMBER";
  const mode = (session.user as SessionUserView).viewMode;
  return mode && VIEW_MODES.includes(mode as ViewMode) ? mode : "MEMBER";
}

/**
 * Режим «председатель» (ППО, МПО или РПО) выбран в кабинете.
 */
export function isChairmanView(session: Session | null): boolean {
  const mode = getViewMode(session);
  return mode === "PPO_HEAD" || mode === "MPO_HEAD" || mode === "RPO_HEAD";
}

/**
 * Доступные режимы для переключателя на основе сессии (без имён организаций).
 * ППО, МПО и РПО взаимоисключающие: показываем только один кабинет председателя,
 * приоритет РПО > МПО > ППО.
 * Если пользователь — сотрудник (добавлен председателем по роли РПО), добавляется режим «Сотрудник».
 */
export function getAvailableViewModes(
  session: Session | null,
  isStaff?: boolean
): ViewModeOption[] {
  if (!session?.user) {
    return [{ mode: "MEMBER", label: "Член участник" }];
  }

  const u = session.user as SessionUserView;
  const role = u.role || null;
  const isMemberRole = role === "MEMBER" || role === "PENDING_MEMBER";
  const isPPOHead = Boolean(u.isPPOHead || role === "PPO_HEAD");
  const isMPOHead = Boolean(u.isMPOHead);
  const isRPOHead = Boolean(u.isRPOHead);
  const canUseMemberMode = isMemberRole || isPPOHead || isMPOHead || isRPOHead || isStaff;

  const modes: ViewModeOption[] = [];
  if (canUseMemberMode) {
    modes.push({ mode: "MEMBER", label: "Член участник" });
  }
  // Режим «Сотрудник»: у кого есть активная должность по роли РПО (добавлен председателем ППО)
  if (isStaff) {
    modes.push({ mode: "STAFF", label: "Сотрудник" });
  }
  // Только один кабинет председателя: РПО, МПО или ППО (в порядке приоритета)
  if (isRPOHead && u.rpoHeadOrganizationId) {
    modes.push({ mode: "RPO_HEAD", label: "Региональный" });
  } else if (isMPOHead && u.mpoHeadOrganizationId) {
    modes.push({ mode: "MPO_HEAD", label: "Председатель МПО" });
  } else if (isPPOHead && u.ppoHeadOrganizationId) {
    modes.push({ mode: "PPO_HEAD", label: "Председатель" });
  }
  if (modes.length === 0) {
    modes.push({ mode: "MEMBER", label: "Член участник" });
  }
  return modes;
}

/**
 * Валидный текущий режим: либо запрошенный (если доступен), либо первый из доступных.
 */
export function resolveCurrentMode(
  requestedMode: string | null | undefined,
  availableModes: ViewModeOption[]
): string {
  if (requestedMode && availableModes.some((m) => m.mode === requestedMode)) {
    return requestedMode;
  }
  return availableModes[0]?.mode ?? "MEMBER";
}
