import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRpoScope } from "@/lib/rpo-role-templates";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

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

    const scope = await requireRpoScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const role = await prisma.staffRole.findFirst({
      where: { id, organizationId: scope.organizationId },
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
      role: { ...role, permissions: normalizeStaffPermissions(role.permissions) },
    });
  } catch (error) {
    console.error("[rpo/roles/[id]] GET error:", error);
    return NextResponse.json({ error: "Ошибка при получении роли" }, { status: 500 });
  }
}

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

    const scope = await requireRpoScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const existing = await prisma.staffRole.findFirst({
      where: { id, organizationId: scope.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, permissions, isActive, isElectedBody, isManagement } = body;

    if (name && name !== existing.name) {
      const dup = await prisma.staffRole.findUnique({
        where: {
          organizationId_name: { organizationId: scope.organizationId, name },
        },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Роль с таким названием уже существует" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.staffRole.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(permissions !== undefined && { permissions: normalizeStaffPermissions(permissions) }),
        ...(isActive !== undefined && { isActive }),
        ...(isElectedBody !== undefined && { isElectedBody }),
        ...(isManagement !== undefined && { isManagement }),
      },
    });

    return NextResponse.json({
      role: { ...updated, permissions: normalizeStaffPermissions(updated.permissions) },
    });
  } catch (error) {
    console.error("[rpo/roles/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Ошибка при обновлении роли" }, { status: 500 });
  }
}

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

    const scope = await requireRpoScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const existing = await prisma.staffRole.findFirst({
      where: { id, organizationId: scope.organizationId },
      include: { _count: { select: { staff: { where: { status: "ACTIVE" } } } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Роль не найдена" }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: "Системную роль нельзя удалить, только деактивировать" },
        { status: 400 }
      );
    }

    if (existing._count.staff > 0) {
      return NextResponse.json(
        { error: `Нельзя удалить роль с активными сотрудниками (${existing._count.staff})` },
        { status: 400 }
      );
    }

    await prisma.staffRole.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[rpo/roles/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Ошибка при удалении роли" }, { status: 500 });
  }
}
