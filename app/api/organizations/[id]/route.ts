import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/organizations/[id]
 * Получает данные организации по ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: params.id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        children: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            type: true,
            level: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { name: "asc" },
          ],
        },
      },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Организация не найдена" },
        { status: 404 }
      );
    }

    return NextResponse.json({ organization });
  } catch (error) {
    console.error("[organizations/id] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении данных организации" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/organizations/[id]
 * Обновляет данные организации (только для SUPER_ADMIN)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Проверяем права супер-админа
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, type, parentId, inn, address, phone, email, chairmanName, sortOrder, isActive } = body;

    // Проверяем существование организации
    const existingOrg = await prisma.organization.findUnique({
      where: { id: params.id },
    });

    if (!existingOrg) {
      return NextResponse.json(
        { error: "Организация не найдена" },
        { status: 404 }
      );
    }

    // Определяем новый уровень и полный путь (если изменился parentId)
    let level = existingOrg.level;
    let fullPath = existingOrg.fullPath;

    if (parentId !== undefined && parentId !== existingOrg.parentId) {
      if (parentId) {
        const parent = await prisma.organization.findUnique({
          where: { id: parentId },
          select: { level: true, fullPath: true, name: true },
        });

        if (parent) {
          level = parent.level + 1;
          fullPath = `${parent.fullPath || parent.name} / ${name || existingOrg.name}`;
        }
      } else {
        level = 0;
        fullPath = name || existingOrg.name;
      }
    } else if (name && name !== existingOrg.name) {
      // Если изменилось только имя, обновляем fullPath
      if (existingOrg.parentId) {
        const parent = await prisma.organization.findUnique({
          where: { id: existingOrg.parentId },
          select: { fullPath: true, name: true },
        });

        if (parent) {
          fullPath = `${parent.fullPath || parent.name} / ${name}`;
        }
      } else {
        fullPath = name;
      }
    }

    // Обновляем организацию
    const organization = await prisma.organization.update({
      where: { id: params.id },
      data: {
        name: name !== undefined ? name : undefined,
        type: type !== undefined ? type : undefined,
        parentId: parentId !== undefined ? (parentId || null) : undefined,
        level,
        fullPath,
        sortOrder: sortOrder !== undefined ? sortOrder : undefined,
        inn: inn !== undefined ? (inn || null) : undefined,
        address: address !== undefined ? (address || null) : undefined,
        phone: phone !== undefined ? (phone || null) : undefined,
        email: email !== undefined ? (email || null) : undefined,
        chairmanName: chairmanName !== undefined ? (chairmanName || null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    });

    // Если изменился уровень или fullPath, обновляем всех детей рекурсивно
    if (level !== existingOrg.level || fullPath !== existingOrg.fullPath) {
      await updateChildrenPaths(params.id, level, fullPath);
    }

    console.log("[organizations/id] Updated:", organization.id, organization.name);

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error("[organizations/id] PUT error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении организации" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/organizations/[id]
 * Удаляет организацию (мягкое удаление - isActive = false)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Проверяем права супер-админа
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    // Проверяем, есть ли члены в этой организации
    const membersCount = await prisma.user.count({
      where: { organizationId: params.id },
    });

    if (membersCount > 0) {
      return NextResponse.json(
        { error: `Невозможно удалить организацию с активными членами (${membersCount})` },
        { status: 400 }
      );
    }

    // Мягкое удаление
    const organization = await prisma.organization.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    console.log("[organizations/id] Deleted (soft):", organization.id, organization.name);

    return NextResponse.json({
      success: true,
      message: "Организация деактивирована",
    });
  } catch (error) {
    console.error("[organizations/id] DELETE error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении организации" },
      { status: 500 }
    );
  }
}

/**
 * Рекурсивно обновляет fullPath и level для всех дочерних организаций
 */
async function updateChildrenPaths(parentId: string, parentLevel: number, parentPath: string) {
  const children = await prisma.organization.findMany({
    where: { parentId },
    select: { id: true, name: true },
  });

  for (const child of children) {
    const newLevel = parentLevel + 1;
    const newPath = `${parentPath} / ${child.name}`;

    await prisma.organization.update({
      where: { id: child.id },
      data: {
        level: newLevel,
        fullPath: newPath,
      },
    });

    // Рекурсивно обновляем детей этого ребенка
    await updateChildrenPaths(child.id, newLevel, newPath);
  }
}

