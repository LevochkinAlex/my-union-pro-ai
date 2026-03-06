import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

/**
 * GET /api/org-head/organizations/[id]/roles
 * Список ролей организации (для РПО: выбор роли при назначении сотрудника в ППО)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: organizationId } = await context.params;
    const scope = await getOrgHeadScope(session.user.id);
    if (!scope || !scope.organizationIds.includes(organizationId)) {
      return NextResponse.json({ error: "Нет доступа к организации" }, { status: 403 });
    }

    const roles = await prisma.staffRole.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true,
        isSystem: true,
        _count: { select: { staff: { where: { status: "ACTIVE" } } } },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: normalizeStaffPermissions(r.permissions),
        isSystem: r.isSystem,
        staffCount: r._count.staff,
      })),
    });
  } catch (error: any) {
    console.error("[org-head/organizations/[id]/roles] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка получения ролей", details: process.env.NODE_ENV === "development" ? error.message : undefined },
      { status: 500 }
    );
  }
}
