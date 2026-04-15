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

// PATCH — редактирование ролей в ППО отключено (шаблоны в кабинете РПО)
export async function PATCH(
  _request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          "Редактирование ролей в ППО отключено. Используйте кабинет РПО для управления шаблонами.",
        denyReason: "RPO_ROLE_TEMPLATES_ENABLED",
      },
      { status: 403 }
    );
  } catch (error) {
    console.error("[API] Error updating role:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении роли" },
      { status: 500 }
    );
  }
}

// DELETE — удаление ролей в ППО отключено (шаблоны в кабинете РПО)
export async function DELETE(
  _request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          "Удаление ролей в ППО отключено. Управление ролями выполняется в кабинете РПО.",
        denyReason: "RPO_ROLE_TEMPLATES_ENABLED",
      },
      { status: 403 }
    );
  } catch (error) {
    console.error("[API] Error deleting role:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении роли" },
      { status: 500 }
    );
  }
}
