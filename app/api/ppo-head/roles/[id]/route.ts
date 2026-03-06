/**
 * API для управления конкретной ролью
 * GET /api/ppo-head/roles/[id] - получить роль
 * PATCH /api/ppo-head/roles/[id] - редактировать роль
 * DELETE /api/ppo-head/roles/[id] - удалить роль
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { isRpoRoleTemplatesEnabled } from "@/lib/feature-flags";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

// GET - получить роль по ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const access = await checkUserPermissions(session.user.id, "staff_view");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const role = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
      },
      include: {
        staff: {
          where: { status: "ACTIVE" },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });
    }

    return NextResponse.json({
      role: {
        ...role,
        permissions: normalizeStaffPermissions(role.permissions),
      },
    });
  } catch (error) {
    console.error("[API] Error fetching role:", error);
    return NextResponse.json(
      { error: "Ошибка при получении роли" },
      { status: 500 }
    );
  }
}

// PATCH - редактировать роль
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (isRpoRoleTemplatesEnabled()) {
      return NextResponse.json(
        {
          error:
            "Редактирование ролей в ППО отключено. Используйте кабинет РПО для управления шаблонами.",
          denyReason: "RPO_ROLE_TEMPLATES_ENABLED",
        },
        { status: 403 }
      );
    }

    const access = await checkUserPermissions(session.user.id, "staff_manage");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Недостаточно прав для редактирования роли",
          requiredPermission: "staff_manage",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    // Проверяем что роль принадлежит организации
    const existingRole = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
      },
    });

    if (!existingRole) {
      return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, permissions, isActive } = body;

    // Проверяем уникальность названия если оно изменилось
    if (name && name !== existingRole.name) {
      const duplicate = await prisma.staffRole.findUnique({
        where: {
          organizationId_name: {
            organizationId: access.organizationId,
            name,
          },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "Роль с таким названием уже существует" },
          { status: 400 }
        );
      }
    }

    const updatedRole = await prisma.staffRole.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(permissions !== undefined && {
          permissions: normalizeStaffPermissions(permissions),
        }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ role: updatedRole });
  } catch (error) {
    console.error("[API] Error updating role:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении роли" },
      { status: 500 }
    );
  }
}

// DELETE - удалить роль
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (isRpoRoleTemplatesEnabled()) {
      return NextResponse.json(
        {
          error:
            "Удаление ролей в ППО отключено. Управление ролями выполняется в кабинете РПО.",
          denyReason: "RPO_ROLE_TEMPLATES_ENABLED",
        },
        { status: 403 }
      );
    }

    const access = await checkUserPermissions(session.user.id, "staff_manage");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Недостаточно прав для удаления роли",
          requiredPermission: "staff_manage",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const existingRole = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
      },
      include: {
        _count: {
          select: {
            staff: { where: { status: "ACTIVE" } },
          },
        },
      },
    });

    if (!existingRole) {
      return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });
    }

    // Нельзя удалить системную роль
    if (existingRole.isSystem) {
      return NextResponse.json(
        { error: "Системную роль нельзя удалить, только деактивировать" },
        { status: 400 }
      );
    }

    // Нельзя удалить роль с активными сотрудниками
    if (existingRole._count.staff > 0) {
      return NextResponse.json(
        {
          error: `Нельзя удалить роль с активными сотрудниками (${existingRole._count.staff})`,
        },
        { status: 400 }
      );
    }

    await prisma.staffRole.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting role:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении роли" },
      { status: 500 }
    );
  }
}
