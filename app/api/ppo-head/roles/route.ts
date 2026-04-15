/**
 * API для управления ролями сотрудников организации
 * GET /api/ppo-head/roles - список ролей
 * POST /api/ppo-head/roles - создание новой роли
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDefaultRolesForOrganization } from "@/prisma/seed-staff-roles";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

// GET - получить список ролей организации
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем пользователя с организацией
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        viewMode: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем права: Председатель или сотрудник с правом staff_view
    let organizationId: string | null = null;

    if (user.isPPOHead && user.ppoHeadOrganizationId) {
      organizationId = user.ppoHeadOrganizationId;
    } else {
      const permissions = await checkUserPermissions(user.id, "staff_view");
      if (permissions.hasAccess) {
        organizationId = permissions.organizationId;
      }
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "Нет доступа к управлению ролями" },
        { status: 403 }
      );
    }

    // Синхронизируем предустановленные роли (добавляет недостающие, например «Член профкома»)
    await createDefaultRolesForOrganization(organizationId);

    // Получаем роли организации (исключаем дубликат "Член профкома." с точкой)
    const roles = await prisma.staffRole.findMany({
      where: {
        organizationId,
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

    const filteredRoles = roles.filter((r) => r.name !== "Член профкома.");

    return NextResponse.json({
      readOnly: true,
      roles: filteredRoles.map((r) => ({
        ...r,
        permissions: normalizeStaffPermissions(r.permissions),
        staffCount: r._count.staff,
      })),
    });
  } catch (error) {
    console.error("[API] Error fetching roles:", error);
    return NextResponse.json(
      { error: "Ошибка при получении ролей" },
      { status: 500 }
    );
  }
}

// POST — создание ролей в ППО отключено (шаблоны в кабинете РПО)
export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          "Создание ролей перенесено в кабинет РПО. В ППО доступно только назначение существующих ролей.",
        denyReason: "RPO_ROLE_TEMPLATES_ENABLED",
      },
      { status: 403 }
    );
  } catch (error) {
    console.error("[API] Error creating role:", error);
    return NextResponse.json(
      { error: "Ошибка при создании роли" },
      { status: 500 }
    );
  }
}
