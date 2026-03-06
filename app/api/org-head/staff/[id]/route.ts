/**
 * GET /api/org-head/staff/[id] - получить сотрудника
 * PATCH /api/org-head/staff/[id] - изменить роль/статус
 * DELETE /api/org-head/staff/[id] - удалить
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const staff = await prisma.organizationStaff.findFirst({
      where: {
        id,
        organizationId: { in: scope.organizationIds },
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
        organization: { select: { id: true, name: true, type: true } },
      },
    });

    if (!staff) {
      return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    }

    return NextResponse.json({
      staff: {
        ...staff,
        role: { ...staff.role, permissions: normalizeStaffPermissions(staff.role.permissions) },
      },
    });
  } catch (error) {
    console.error("[org-head/staff/[id]] GET error:", error);
    return NextResponse.json({ error: "Ошибка при получении сотрудника" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const existing = await prisma.organizationStaff.findFirst({
      where: { id, organizationId: { in: scope.organizationIds } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    }

    const body = await request.json();
    const { roleId, status, notes } = body;

    if (roleId) {
      const role = await prisma.staffRole.findFirst({
        where: {
          id: roleId,
          organizationId: existing.organizationId,
          isActive: true,
        },
      });
      if (!role) {
        return NextResponse.json({ error: "Роль не найдена в этой организации" }, { status: 404 });
      }
    }

    const updated = await prisma.organizationStaff.update({
      where: { id },
      data: {
        ...(roleId && { roleId }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        role: { select: { name: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ staff: updated });
  } catch (error) {
    console.error("[org-head/staff/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Ошибка при обновлении сотрудника" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const existing = await prisma.organizationStaff.findFirst({
      where: { id, organizationId: { in: scope.organizationIds } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    }

    await prisma.organizationStaff.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[org-head/staff/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Ошибка при удалении сотрудника" }, { status: 500 });
  }
}
