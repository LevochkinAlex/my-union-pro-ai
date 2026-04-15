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
  if (
    key === "PENDING" ||
    key === "UNDER_REVIEW" ||
    key === "PENDING_VERIFICATION" ||
    key === "DOCUMENTS_PENDING" ||
    key === "PROFILE_INCOMPLETE" ||
    key === "NOT_ACCEPTED"
  ) {
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
    PARTNER: "Партнёр",
    STAFF: "Сотрудник",
    UNION_MEMBER: "Член профсоюза",
  };
  return map[key] || (role || "—");
}

export const ORG_TYPE_LABELS: Record<string, string> = {
  PRIMARY: "ППО",
  LOCAL: "МПО",
  REGIONAL: "РПО",
  FEDERAL: "ФПО",
};

export const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
  WORK: "Работает",
  STUDY: "Учится",
  RETIREMENT: "На пенсии",
  EMPLOYED: "Трудоустроен",
  UNEMPLOYED: "Не работает",
  STUDENT: "Студент",
  PENSIONER: "Пенсионер",
  SELF_EMPLOYED: "Самозанятый",
};

export const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: "Не женат/не замужем",
  MARRIED: "Женат/замужем",
  DIVORCED: "Разведён(а)",
  WIDOWED: "Вдовец/вдова",
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  MEMBERSHIP_APPLICATION: "Заявление о вступлении",
  CONTRIBUTION_APPLICATION: "Заявление о взносах",
  MEETING_PROTOCOL: "Протокол",
  OTHER: "Другой",
};

export const APPEAL_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Ожидание", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  IN_PROGRESS: { label: "В работе", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  RESOLVED: { label: "Решено", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  REJECTED: { label: "Отклонено", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  CLOSED: { label: "Закрыто", cls: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
};

export const BEST_BENEFITS_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активен",
  PENDING: "Ожидание",
  INACTIVE: "Неактивен",
};

/** Подписи статусов документов для отображения в UI */
export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  GENERATED: "Сформирован",
  PENDING_REVIEW: "На рассмотрении",
  PENDING_APPROVAL: "На согласовании",
  PENDING_SIGNATURE: "На подписи",
  SIGNED: "Подписан",
  REGISTERED: "Зарегистрирован",
  SENT: "Отправлен",
  RECEIVED: "Получен",
  COMPLETED: "Исполнен",
  REJECTED: "Отклонён",
  ARCHIVED: "В архиве",
};

export function getDocumentStatusLabel(status?: string | null): string {
  const key = (status || "").toUpperCase();
  return DOCUMENT_STATUS_LABELS[key] || (status || "—");
}

export function getDocumentStatusInfo(doc: { status: string; signedFilePath?: string | null }): { text: string; color: string } {
  if (doc.status === "SIGNED" || doc.signedFilePath) {
    return { text: "Подписан", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" };
  }
  if (doc.status === "GENERATED") {
    return { text: "Сформирован", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" };
  }
  return { text: getDocumentStatusLabel(doc.status), color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" };
}

export function getEffectiveMemberStatus(membershipStatus: string, unionMembershipStatus?: string | null): string {
  // Исключённые/отклонённые — всегда показываем их статус, не «Принят на учет»
  if (membershipStatus === "EXCLUDED" || membershipStatus === "REJECTED") return membershipStatus;
  if (unionMembershipStatus === "REMOVED") return "REMOVED";
  if (unionMembershipStatus === "ACCEPTED") return "ACCEPTED";
  return membershipStatus;
}
