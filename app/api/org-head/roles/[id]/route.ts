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
      return NextResponse.json({ error: "Доступно только для РПО" }, { status: 403 });
    }

    const role = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
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
    });

    if (!role) {
      return NextResponse.json({ error: "Шаблон роли не найден" }, { status: 404 });
    }

    return NextResponse.json({
      template: {
        ...role,
        permissions: normalizeStaffPermissions(role.permissions),
        staffCount: role._count.staff,
      },
    });
  } catch (error: any) {
    console.error("[org-head/roles/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка получения шаблона роли", details: error?.message },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "Доступно только для РПО" }, { status: 403 });
    }

    const existing = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
      },
      select: { id: true, name: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Шаблон роли не найден" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      description?: string | null;
      permissions?: Record<string, unknown>;
      isActive?: boolean;
      isElectedBody?: boolean;
      isManagement?: boolean;
    };

    const name = body.name?.trim();
    if (name && name !== existing.name) {
      const duplicate = await prisma.staffRole.findUnique({
        where: {
          organizationId_name: {
            organizationId: scope.organizationId,
            name,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Роль с таким названием уже существует" }, { status: 400 });
      }
    }

    const updated = await prisma.staffRole.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
        ...(body.permissions !== undefined
          ? { permissions: normalizeStaffPermissions(body.permissions) }
          : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive === true } : {}),
        ...(body.isElectedBody !== undefined ? { isElectedBody: body.isElectedBody === true } : {}),
        ...(body.isManagement !== undefined ? { isManagement: body.isManagement === true } : {}),
      },
    });

    return NextResponse.json({
      template: {
        ...updated,
        permissions: normalizeStaffPermissions(updated.permissions),
      },
    });
  } catch (error: any) {
    console.error("[org-head/roles/[id]] PATCH error:", error);
    return NextResponse.json(
      { error: "Ошибка обновления шаблона роли", details: error?.message },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "Доступно только для РПО" }, { status: 403 });
    }

    const existing = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
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
    });

    if (!existing) {
      return NextResponse.json({ error: "Шаблон роли не найден" }, { status: 404 });
    }

    if (existing._count.staff > 0) {
      return NextResponse.json(
        { error: "Нельзя удалить шаблон роли, который назначен сотрудникам" },
        { status: 400 }
      );
    }

    await prisma.staffRole.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[org-head/roles/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления шаблона роли", details: error?.message },
      { status: 500 }
    );
  }
}

