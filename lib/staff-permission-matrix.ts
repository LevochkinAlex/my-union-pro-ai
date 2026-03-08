export const STAFF_PERMISSION_KEYS = [
  "documents_view",
  "documents_create",
  "documents_edit",
  "documents_review",
  "documents_approve",
  "documents_sign",
  "discounts_view",
  "discounts_manage",
  "members_view",
  "members_edit",
  "members_manage",
  "appeals_view",
  "appeals_respond",
  "appeals_manage",
  "chats_view",
  "chats_participate",
  "chats_create",
  "news_view",
  "news_create",
  "news_manage",
  "reports_view",
  "reports_create",
  "settings_view",
  "settings_manage",
  "staff_view",
  "staff_manage",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSION_KEYS)[number];

export type StaffPermissionsMap = Record<StaffPermission, boolean>;

export function getEmptyPermissions(): StaffPermissionsMap {
  return STAFF_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as StaffPermissionsMap);
}

export function getAllStaffPermissions(): StaffPermissionsMap {
  return STAFF_PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {} as StaffPermissionsMap);
}

export function normalizeStaffPermissions(input: unknown): StaffPermissionsMap {
  const normalized = getEmptyPermissions();
  if (!input || typeof input !== "object") {
    return normalized;
  }

  const source = input as Record<string, unknown>;
  for (const key of STAFF_PERMISSION_KEYS) {
    normalized[key] = source[key] === true;
  }

  return normalized;
}

export function isStaffPermission(value: string): value is StaffPermission {
  return STAFF_PERMISSION_KEYS.includes(value as StaffPermission);
}

