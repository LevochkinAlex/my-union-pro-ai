export function getMembershipStatusLabel(status?: string | null): string {
  const key = (status || "").toUpperCase();
  const map: Record<string, string> = {
    PENDING: "На проверке",
    UNDER_REVIEW: "На проверке",
    PENDING_VERIFICATION: "Ожидает верификации",
    PROFILE_INCOMPLETE: "Профиль не заполнен",
    DOCUMENTS_PENDING: "Документы на проверке",
    APPROVED: "Одобрен",
    ACTIVE: "Активен",
    ACCEPTED: "Принят на учет",
    NOT_ACCEPTED: "Не принят на учет",
    REMOVED: "Снят с учета",
    TRANSFERRED: "Переведен",
    REJECTED: "Отклонен",
    EXCLUDED: "Исключен",
    INACTIVE: "Неактивен",
    SUSPENDED: "Приостановлен",
    DRAFT: "Черновик",
  };
  return map[key] || (status || "Не указан");
}

export function getMembershipStatusBadgeClass(status?: string | null): string {
  const key = (status || "").toUpperCase();
  if (key === "APPROVED" || key === "ACTIVE" || key === "ACCEPTED") {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  }
  if (key === "PENDING" || key === "UNDER_REVIEW" || key === "PENDING_VERIFICATION" || key === "DOCUMENTS_PENDING" || key === "PROFILE_INCOMPLETE" || key === "NOT_ACCEPTED") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
  }
  if (key === "REJECTED" || key === "EXCLUDED" || key === "SUSPENDED" || key === "REMOVED") {
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  }
  if (key === "TRANSFERRED") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  }
  return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
}

export function getUserRoleLabel(role?: string | null, isPPOHead?: boolean): string {
  if (isPPOHead) return "Председатель ППО";
  const key = (role || "").toUpperCase();
  const map: Record<string, string> = {
    SUPER_ADMIN: "Супер-админ",
    ADMIN: "Администратор",
    PENDING_MEMBER: "Новый пользователь",
    MEMBER: "Участник",
    PPO_HEAD: "Председатель ППО",
    MPO_HEAD: "Председатель МПО",
    RPO_HEAD: "Председатель РПО",
    REGIONAL_CHAIRMAN: "Председатель РПО",
    FEDERAL_CHAIRMAN: "Председатель федерации",
    STAFF: "Сотрудник",
    UNION_MEMBER: "Член профсоюза",
  };
  return map[key] || (role || "—");
}
