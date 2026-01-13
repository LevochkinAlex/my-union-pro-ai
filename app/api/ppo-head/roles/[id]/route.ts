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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    if (!user?.isPPOHead || !user.ppoHeadOrganizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const role = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: user.ppoHeadOrganizationId,
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

    return NextResponse.json({ role });
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    if (!user?.isPPOHead || !user.ppoHeadOrganizationId) {
      return NextResponse.json(
        { error: "Только Председатель может редактировать роли" },
        { status: 403 }
      );
    }

    // Проверяем что роль принадлежит организации
    const existingRole = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: user.ppoHeadOrganizationId,
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
            organizationId: user.ppoHeadOrganizationId,
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
        ...(permissions !== undefined && { permissions }),
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
      },
    });

    if (!user?.isPPOHead || !user.ppoHeadOrganizationId) {
      return NextResponse.json(
        { error: "Только Председатель может удалять роли" },
        { status: 403 }
      );
    }

    const existingRole = await prisma.staffRole.findFirst({
      where: {
        id,
        organizationId: user.ppoHeadOrganizationId,
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
