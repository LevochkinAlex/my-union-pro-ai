import { prisma } from "@/lib/prisma";
import {
  getAllStaffPermissions,
  normalizeStaffPermissions,
  type StaffPermission,
} from "@/lib/staff-permission-matrix";

export type Permission = StaffPermission;

// Результат проверки прав
export interface PermissionCheckResult {
  hasAccess: boolean;
  isChairman: boolean;
  isStaff: boolean;
  organizationId: string | null;
  permissions: Record<string, boolean>;
  roleName: string | null;
  denyReason?: string;
  requiredPermission?: Permission;
  source: "chairman" | "staff" | "none";
}

function isPermissionResolverV2Enabled(): boolean {
  return process.env.PERMISSION_RESOLVER_V2_ENABLED !== "false";
}

/**
 * Проверить права пользователя в организации
 */
export async function checkUserPermissions(
  userId: string,
  requiredPermission?: Permission
): Promise<PermissionCheckResult> {
  if (!isPermissionResolverV2Enabled()) {
    return checkUserPermissionsLegacy(userId, requiredPermission);
  }
  return checkUserPermissionsV2(userId, requiredPermission);
}

async function checkUserPermissionsV2(
  userId: string,
  requiredPermission?: Permission
): Promise<PermissionCheckResult> {
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
      denyReason: "USER_NOT_FOUND",
      requiredPermission,
      source: "none",
    };
  }

  if (user.isPPOHead && user.ppoHeadOrganizationId) {
    if (user.viewMode === "PPO_HEAD") {
      const permissions = getAllStaffPermissions();
      return {
        hasAccess: true,
        isChairman: true,
        isStaff: false,
        organizationId: user.ppoHeadOrganizationId,
        permissions,
        roleName: "Председатель",
        requiredPermission,
        source: "chairman",
      };
    }
  }

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
      denyReason: "NO_ACTIVE_STAFF_POSITION",
      requiredPermission,
      source: "none",
    };
  }

  const permissions = normalizeStaffPermissions(staffPosition.role.permissions);

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
    denyReason: hasAccess ? undefined : "MISSING_PERMISSION",
    requiredPermission,
    source: "staff",
  };
}

async function checkUserPermissionsLegacy(
  userId: string,
  requiredPermission?: Permission
): Promise<PermissionCheckResult> {
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
      denyReason: "USER_NOT_FOUND",
      requiredPermission,
      source: "none",
    };
  }

  if (user.isPPOHead && user.ppoHeadOrganizationId && user.viewMode === "PPO_HEAD") {
    return {
      hasAccess: true,
      isChairman: true,
      isStaff: false,
      organizationId: user.ppoHeadOrganizationId,
      permissions: getAllStaffPermissions(),
      roleName: "Председатель",
      requiredPermission,
      source: "chairman",
    };
  }

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
      denyReason: "NO_ACTIVE_STAFF_POSITION",
      requiredPermission,
      source: "none",
    };
  }

  const rolePermissions = (staffPosition.role.permissions as Record<string, boolean>) || {};
  const hasAccess = requiredPermission ? rolePermissions[requiredPermission] === true : true;

  return {
    hasAccess,
    isChairman: false,
    isStaff: true,
    organizationId: staffPosition.organizationId,
    permissions: rolePermissions,
    roleName: staffPosition.role.name,
    denyReason: hasAccess ? undefined : "MISSING_PERMISSION",
    requiredPermission,
    source: "staff",
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
): Promise<{
  error: string;
  status: number;
  requiredPermission: Permission;
  denyReason: string;
} | null> {
  const result = await checkUserPermissions(userId, permission);

  if (!result.hasAccess) {
    if (!result.isChairman && !result.isStaff && result.denyReason) {
      return {
        error: "Нет доступа к ресурсам организации",
        status: 403,
        requiredPermission: permission,
        denyReason: result.denyReason,
      };
    }
    return {
      error: `Недостаточно прав. Требуется: ${permission}`,
      status: 403,
      requiredPermission: permission,
      denyReason: result.denyReason || "MISSING_PERMISSION",
    };
  }

  return null;
}

export async function getEffectivePermissions(
  userId: string,
  requiredPermission?: Permission
): Promise<PermissionCheckResult> {
  return checkUserPermissions(userId, requiredPermission);
}
