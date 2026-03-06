/**
 * API для управления конкретным сотрудником
 * GET /api/ppo-head/staff/[id] - получить сотрудника
 * PATCH /api/ppo-head/staff/[id] - редактировать (изменить роль, статус)
 * DELETE /api/ppo-head/staff/[id] - удалить сотрудника
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

// GET - получить сотрудника
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
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "staff_view",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const staff = await prisma.organizationStaff.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        role: true,
      },
    });

    if (!staff) {
      return NextResponse.json(
        { error: "Сотрудник не найден" },
        { status: 404 }
      );
    }

    return NextResponse.json({ staff });
  } catch (error) {
    console.error("[API] Error fetching staff:", error);
    return NextResponse.json(
      { error: "Ошибка при получении сотрудника" },
      { status: 500 }
    );
  }
}

// PATCH - редактировать сотрудника
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

    const access = await checkUserPermissions(session.user.id, "staff_manage");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Недостаточно прав для редактирования сотрудника",
          requiredPermission: "staff_manage",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const existingStaff = await prisma.organizationStaff.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
      },
    });

    if (!existingStaff) {
      return NextResponse.json(
        { error: "Сотрудник не найден" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { roleId, status, notes } = body;

    // Если меняем роль, проверяем что она существует
    if (roleId) {
      const role = await prisma.staffRole.findFirst({
        where: {
          id: roleId,
          organizationId: access.organizationId,
          isActive: true,
        },
      });

      if (!role) {
        return NextResponse.json(
          { error: "Роль не найдена" },
          { status: 404 }
        );
      }
    }

    const updatedStaff = await prisma.organizationStaff.update({
      where: { id },
      data: {
        ...(roleId && { roleId }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        role: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({ staff: updatedStaff });
  } catch (error) {
    console.error("[API] Error updating staff:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении сотрудника" },
      { status: 500 }
    );
  }
}

// DELETE - удалить сотрудника
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

    const access = await checkUserPermissions(session.user.id, "staff_manage");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Недостаточно прав для удаления сотрудника",
          requiredPermission: "staff_manage",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const existingStaff = await prisma.organizationStaff.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
      },
    });

    if (!existingStaff) {
      return NextResponse.json(
        { error: "Сотрудник не найден" },
        { status: 404 }
      );
    }

    await prisma.organizationStaff.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting staff:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении сотрудника" },
      { status: 500 }
    );
  }
}
