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
import { isRpoRoleTemplatesEnabled } from "@/lib/feature-flags";
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
      readOnly: isRpoRoleTemplatesEnabled(),
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

// POST - создать новую роль
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    if (isRpoRoleTemplatesEnabled()) {
      return NextResponse.json(
        {
          error:
            "Создание ролей перенесено в кабинет РПО. В ППО доступно только назначение существующих ролей.",
          denyReason: "RPO_ROLE_TEMPLATES_ENABLED",
        },
        { status: 403 }
      );
    }

    const access = await checkUserPermissions(session.user.id, "staff_manage");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Недостаточно прав для создания роли",
          requiredPermission: "staff_manage",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, permissions } = body;

    if (!name || !permissions) {
      return NextResponse.json(
        { error: "Название и права обязательны" },
        { status: 400 }
      );
    }

    // Проверяем уникальность названия
    const existingRole = await prisma.staffRole.findUnique({
      where: {
        organizationId_name: {
          organizationId: access.organizationId,
          name,
        },
      },
    });

    if (existingRole) {
      return NextResponse.json(
        { error: "Роль с таким названием уже существует" },
        { status: 400 }
      );
    }

    const role = await prisma.staffRole.create({
      data: {
        organizationId: access.organizationId,
        name,
        description,
        permissions: normalizeStaffPermissions(permissions),
        isSystem: false,
        isActive: true,
      },
    });

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating role:", error);
    return NextResponse.json(
      { error: "Ошибка при создании роли" },
      { status: 500 }
    );
  }
}
