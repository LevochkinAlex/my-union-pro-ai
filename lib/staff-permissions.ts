/**
 * Утилиты для проверки прав доступа сотрудников
 */

import { prisma } from "@/lib/prisma";

// Типы прав доступа
export type Permission =
  | "documents_view"
  | "documents_create"
  | "documents_edit"
  | "discounts_view"
  | "discounts_manage"
  | "members_view"
  | "members_edit"
  | "members_manage"
  | "appeals_view"
  | "appeals_respond"
  | "appeals_manage"
  | "chats_view"
  | "chats_participate"
  | "chats_create"
  | "news_view"
  | "news_create"
  | "news_manage"
  | "reports_view"
  | "reports_create"
  | "settings_view"
  | "settings_manage"
  | "staff_view"
  | "staff_manage";

// Результат проверки прав
export interface PermissionCheckResult {
  hasAccess: boolean;
  isChairman: boolean;
  isStaff: boolean;
  organizationId: string | null;
  permissions: Record<string, boolean>;
  roleName: string | null;
}

/**
 * Проверить права пользователя в организации
 */
export async function checkUserPermissions(
  userId: string,
  requiredPermission?: Permission
): Promise<PermissionCheckResult> {
  // Получаем данные пользователя
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isPPOHead: true,
      ppoHeadOrganizationId: true,
      viewMode: true,
    },
  });

  if (!user) {
    return {
      hasAccess: false,
      isChairman: false,
      isStaff: false,
      organizationId: null,
      permissions: {},
      roleName: null,
    };
  }

  // Председатель имеет все права
  if (user.isPPOHead && user.ppoHeadOrganizationId) {
    // Если viewMode = PPO_HEAD, считаем что он действует как Председатель
    if (user.viewMode === "PPO_HEAD") {
      return {
        hasAccess: true,
        isChairman: true,
        isStaff: false,
        organizationId: user.ppoHeadOrganizationId,
        permissions: getAllPermissions(),
        roleName: "Председатель",
      };
    }
  }

  // Проверяем, является ли пользователь сотрудником
  const staffPosition = await prisma.organizationStaff.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      role: true,
    },
  });

  if (!staffPosition) {
    return {
      hasAccess: false,
      isChairman: false,
      isStaff: false,
      organizationId: null,
      permissions: {},
      roleName: null,
    };
  }

  const permissions = (staffPosition.role.permissions as Record<string, boolean>) || {};

  // Если требуется конкретное право, проверяем его
  const hasAccess = requiredPermission
    ? permissions[requiredPermission] === true
    : true;

  return {
    hasAccess,
    isChairman: false,
    isStaff: true,
    organizationId: staffPosition.organizationId,
    permissions,
    roleName: staffPosition.role.name,
  };
}

/**
 * Получить все права (для Председателя)
 */
function getAllPermissions(): Record<string, boolean> {
  return {
    documents_view: true,
    documents_create: true,
    documents_edit: true,
    discounts_view: true,
    discounts_manage: true,
    members_view: true,
    members_edit: true,
    members_manage: true,
    appeals_view: true,
    appeals_respond: true,
    appeals_manage: true,
    chats_view: true,
    chats_participate: true,
    chats_create: true,
    news_view: true,
    news_create: true,
    news_manage: true,
    reports_view: true,
    reports_create: true,
    settings_view: true,
    settings_manage: true,
    staff_view: true,
    staff_manage: true,
  };
}

/**
 * Проверить конкретное право
 */
export async function hasPermission(
  userId: string,
  permission: Permission
): Promise<boolean> {
  const result = await checkUserPermissions(userId, permission);
  return result.hasAccess;
}

/**
 * Получить организацию пользователя (как Председатель или сотрудник)
 */
export async function getUserOrganizationId(
  userId: string
): Promise<string | null> {
  const result = await checkUserPermissions(userId);
  return result.organizationId;
}

/**
 * Middleware для API routes - проверка прав
 * Возвращает null если доступ разрешен, или Response с ошибкой
 */
export async function requirePermission(
  userId: string,
  permission: Permission
): Promise<{ error: string; status: number } | null> {
  const result = await checkUserPermissions(userId, permission);

  if (!result.hasAccess) {
    if (!result.isChairman && !result.isStaff) {
      return { error: "Нет доступа к ресурсам организации", status: 403 };
    }
    return {
      error: `Недостаточно прав. Требуется: ${permission}`,
      status: 403,
    };
  }

  return null;
}
