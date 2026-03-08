import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";
import type { StaffPermissionsMap } from "@/lib/staff-permission-matrix";

export const DEFAULT_RPO_ROLE_TEMPLATES: Array<{
  name: string;
  description: string;
  permissions: StaffPermissionsMap;
  isElectedBody?: boolean;
  isManagement?: boolean;
}> = [
  {
    name: "Заместитель председателя",
    description: "Полный доступ ко всем функциям, замещает председателя",
    isElectedBody: true,
    isManagement: true,
    permissions: {
      documents_view: true, documents_create: true, documents_edit: true, documents_review: true, documents_approve: true, documents_sign: true,
      discounts_view: true, discounts_manage: true,
      members_view: true, members_edit: true, members_manage: true,
      appeals_view: true, appeals_respond: true, appeals_manage: true,
      chats_view: true, chats_participate: true, chats_create: true,
      news_view: true, news_create: true, news_manage: true,
      reports_view: true, reports_create: true,
      settings_view: true, settings_manage: true,
      staff_view: true, staff_manage: true,
    },
  },
  {
    name: "Бухгалтер",
    description: "Доступ к документам, отчетам и просмотру членов профсоюза",
    permissions: {
      documents_view: true, documents_create: true, documents_edit: true, documents_review: false, documents_approve: false, documents_sign: false,
      discounts_view: false, discounts_manage: false,
      members_view: true, members_edit: false, members_manage: false,
      appeals_view: false, appeals_respond: false, appeals_manage: false,
      chats_view: false, chats_participate: false, chats_create: false,
      news_view: true, news_create: false, news_manage: false,
      reports_view: true, reports_create: true,
      settings_view: false, settings_manage: false,
      staff_view: false, staff_manage: false,
    },
  },
  {
    name: "Секретарь",
    description: "Работа с документами, обращениями и новостями",
    permissions: {
      documents_view: true, documents_create: true, documents_edit: true, documents_review: true, documents_approve: true, documents_sign: false,
      discounts_view: true, discounts_manage: false,
      members_view: true, members_edit: false, members_manage: false,
      appeals_view: true, appeals_respond: true, appeals_manage: true,
      chats_view: true, chats_participate: true, chats_create: false,
      news_view: true, news_create: true, news_manage: true,
      reports_view: true, reports_create: false,
      settings_view: false, settings_manage: false,
      staff_view: true, staff_manage: false,
    },
  },
  {
    name: "Специалист по работе с членами",
    description: "Доступ к карточкам членов профсоюза, скидкам и обращениям",
    permissions: {
      documents_view: true, documents_create: false, documents_edit: false, documents_review: false, documents_approve: false, documents_sign: false,
      discounts_view: true, discounts_manage: true,
      members_view: true, members_edit: true, members_manage: false,
      appeals_view: true, appeals_respond: true, appeals_manage: false,
      chats_view: true, chats_participate: true, chats_create: false,
      news_view: true, news_create: false, news_manage: false,
      reports_view: false, reports_create: false,
      settings_view: false, settings_manage: false,
      staff_view: false, staff_manage: false,
    },
  },
  {
    name: "Специалист по информационной работе",
    description: "Работа с новостями и чатами",
    permissions: {
      documents_view: true, documents_create: false, documents_edit: false, documents_review: false, documents_approve: false, documents_sign: false,
      discounts_view: true, discounts_manage: false,
      members_view: false, members_edit: false, members_manage: false,
      appeals_view: false, appeals_respond: false, appeals_manage: false,
      chats_view: true, chats_participate: true, chats_create: true,
      news_view: true, news_create: true, news_manage: true,
      reports_view: false, reports_create: false,
      settings_view: false, settings_manage: false,
      staff_view: false, staff_manage: false,
    },
  },
  {
    name: "Член профкома",
    description: "Член выборного органа (профсоюзного комитета), участвует в заседаниях",
    isElectedBody: true,
    permissions: {
      documents_view: true, documents_create: false, documents_edit: false, documents_review: true, documents_approve: false, documents_sign: false,
      discounts_view: true, discounts_manage: false,
      members_view: true, members_edit: false, members_manage: false,
      appeals_view: false, appeals_respond: false, appeals_manage: false,
      chats_view: true, chats_participate: true, chats_create: false,
      news_view: true, news_create: false, news_manage: false,
      reports_view: false, reports_create: false,
      settings_view: false, settings_manage: false,
      staff_view: false, staff_manage: false,
    },
  },
];

export async function requireRpoScope(userId: string) {
  const scope = await getOrgHeadScope(userId);
  if (!scope || scope.level !== "RPO") {
    return null;
  }
  return scope;
}

export async function getRpoTemplateRoles(rpoOrganizationId: string) {
  const roles = await prisma.staffRole.findMany({
    where: {
      organizationId: rpoOrganizationId,
      isActive: true,
    },
    include: {
      _count: {
        select: {
          staff: {
            where: { status: "ACTIVE" },
          },
        },
      },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return roles.map((role) => ({
    ...role,
    permissions: normalizeStaffPermissions(role.permissions),
    staffCount: role._count.staff,
  }));
}

export async function ensureDefaultRpoTemplateRoles(rpoOrganizationId: string) {
  for (const role of DEFAULT_RPO_ROLE_TEMPLATES) {
    await prisma.staffRole.upsert({
      where: {
        organizationId_name: {
          organizationId: rpoOrganizationId,
          name: role.name,
        },
      },
      update: {
        description: role.description,
        permissions: normalizeStaffPermissions(role.permissions),
        isActive: true,
        isSystem: true,
        isElectedBody: role.isElectedBody ?? false,
        isManagement: role.isManagement ?? false,
      },
      create: {
        organizationId: rpoOrganizationId,
        name: role.name,
        description: role.description,
        permissions: normalizeStaffPermissions(role.permissions),
        isActive: true,
        isSystem: true,
        isElectedBody: role.isElectedBody ?? false,
        isManagement: role.isManagement ?? false,
      },
    });
  }
}

export async function publishTemplateToOrganizations(
  templateId: string,
  targetOrganizationIds: string[]
) {
  const template = await prisma.staffRole.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      isElectedBody: true,
      isManagement: true,
      organizationId: true,
      isActive: true,
    },
  });

  if (!template || !template.isActive) {
    return { error: "Шаблон роли не найден или отключен" as const };
  }

  const normalizedPermissions = normalizeStaffPermissions(template.permissions);
  const roleDescription = template.description
    ? `${template.description}\n\n[Управляется РПО]`
    : "[Управляется РПО]";

  const results = await Promise.all(
    targetOrganizationIds.map(async (organizationId) => {
      const role = await prisma.staffRole.upsert({
        where: {
          organizationId_name: {
            organizationId,
            name: template.name,
          },
        },
        update: {
          description: roleDescription,
          permissions: normalizedPermissions,
          isSystem: true,
          isActive: true,
          isElectedBody: template.isElectedBody,
          isManagement: template.isManagement,
        },
        create: {
          organizationId,
          name: template.name,
          description: roleDescription,
          permissions: normalizedPermissions,
          isSystem: true,
          isActive: true,
          isElectedBody: template.isElectedBody,
          isManagement: template.isManagement,
        },
        select: { id: true, organizationId: true, name: true },
      });

      return role;
    })
  );

  return {
    template,
    publishedCount: results.length,
    roles: results,
  };
}

