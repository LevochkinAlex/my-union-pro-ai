import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrganizationType } from "@prisma/client";

/**
 * GET /api/admin/organizations/[id]
 * Получить организацию по ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            type: true,
            level: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    const chairmanWhereByType: Partial<Record<OrganizationType, Record<string, string>>> = {
      PRIMARY: { ppoHeadOrganizationId: id },
      LOCAL: { mpoHeadOrganizationId: id },
      REGIONAL: { rpoHeadOrganizationId: id },
    };

    const chairmanUser = chairmanWhereByType[organization.type]
      ? await prisma.user.findFirst({
          where: chairmanWhereByType[organization.type],
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            middleName: true,
            jobTitle: true,
          },
        })
      : null;

    return NextResponse.json({
      organization,
      chairmanUser: chairmanUser
        ? {
            id: chairmanUser.id,
            email: chairmanUser.email ?? "",
            phone: chairmanUser.phone ?? "",
            firstName: chairmanUser.firstName ?? "",
            lastName: chairmanUser.lastName ?? "",
            middleName: chairmanUser.middleName ?? "",
            jobTitle: chairmanUser.jobTitle ?? "",
          }
        : null,
    });
  } catch (error) {
    console.error("[admin/organizations] GET [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении организации" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/organizations/[id]
 * Обновить организацию
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log("[admin/organizations/PUT] Request received");
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;
    console.log("[admin/organizations/PUT] Organization ID:", id);
    
    const body = await request.json();
    console.log("[admin/organizations/PUT] Request body keys:", Object.keys(body));
    
    const {
      name,
      type,
      parentId,
      inn,
      address,
      phone,
      email,
      chairmanName,
      chairmanJobTitle,
      isActive,
      totalEmployees,
    } = body;

    // Проверяем существование организации
    const existingOrg = await prisma.organization.findUnique({
      where: { id },
      include: {
        parent: true,
      },
    });

    if (!existingOrg) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    // Проверяем, что организация не становится своим собственным родителем
    if (parentId === id) {
      return NextResponse.json(
        { error: "Организация не может быть своим собственным родителем" },
        { status: 400 }
      );
    }

    // Проверяем уникальность ИНН, если он указан
    if (inn !== undefined && inn && inn.trim() !== "") {
      const existingOrgWithInn = await prisma.organization.findFirst({
        where: {
          inn: inn.trim(),
          NOT: { id: id },
        },
      });

      if (existingOrgWithInn) {
        return NextResponse.json(
          { error: `Организация с ИНН ${inn} уже существует: ${existingOrgWithInn.name}` },
          { status: 400 }
        );
      }
    }

    // Если меняется parentId, пересчитываем уровень и путь
    let level = existingOrg.level;
    let fullPath = existingOrg.fullPath;
    if (parentId !== undefined && parentId !== existingOrg.parentId) {
      if (parentId) {
        const parent = await prisma.organization.findUnique({
          where: { id: parentId },
          select: { level: true, fullPath: true },
        });
        if (parent) {
          level = parent.level + 1;
          fullPath = parent.fullPath ? `${parent.fullPath} / ${name || existingOrg.name}` : (name || existingOrg.name);
        }
      } else {
        level = 0;
        fullPath = name || existingOrg.name;
      }

      // Обновляем уровни всех дочерних организаций
      await updateChildrenLevels(id, level + 1);
    }

    // Подготавливаем данные для обновления
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type as OrganizationType;
    if (parentId !== undefined) updateData.parentId = parentId || null;
    if (level !== undefined) updateData.level = level;
    if (fullPath !== undefined) updateData.fullPath = fullPath;
    if (inn !== undefined) updateData.inn = inn || null;
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (email !== undefined) updateData.email = email || null;
    if (chairmanName !== undefined) updateData.chairmanName = chairmanName || null;
    if (chairmanJobTitle !== undefined) updateData.chairmanJobTitle = chairmanJobTitle || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (totalEmployees !== undefined) updateData.totalEmployees = totalEmployees == null || totalEmployees === "" ? null : Math.max(0, parseInt(String(totalEmployees), 10) || 0);

    // Если меняется имя, обновляем fullPath для всех дочерних организаций
    if (name !== undefined && name !== existingOrg.name) {
      const newFullPath = existingOrg.parentId 
        ? (existingOrg.parent?.fullPath ? `${existingOrg.parent.fullPath} / ${name}` : name)
        : name;
      updateData.fullPath = newFullPath;
      
      // Обновляем fullPath для всех дочерних организаций
      await updateChildrenFullPath(id, newFullPath);
    }

    const organization = await prisma.organization.update({
      where: { id },
      data: updateData,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            type: true,
            level: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    console.log("[admin/organizations/PUT] Successfully updated organization:", organization.id);
    return NextResponse.json({ organization });
  } catch (error: any) {
    console.error("[admin/organizations/PUT] Error:", error);
    console.error("[admin/organizations/PUT] Error details:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack?.substring(0, 500),
    });
    
    // Возвращаем более детальную информацию об ошибке в режиме разработки
    const errorMessage = process.env.NODE_ENV === "development" 
      ? error?.message || "Ошибка при обновлении организации"
      : "Ошибка при обновлении организации";
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error?.meta : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/organizations/[id]
 * Удалить организацию
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { id } = await params;

    // Проверяем существование организации
    const existingOrg = await prisma.organization.findUnique({
      where: { id },
      include: {
        children: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!existingOrg) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

    // Нельзя удалить организацию с дочерними организациями
    if (existingOrg.children.length > 0) {
      return NextResponse.json(
        { error: "Нельзя удалить организацию с дочерними организациями. Сначала удалите или переместите дочерние организации." },
        { status: 400 }
      );
    }

    // Нельзя удалить организацию с членами
    if (existingOrg._count.members > 0) {
      return NextResponse.json(
        { error: "Нельзя удалить организацию с членами. Сначала переместите членов в другие организации." },
        { status: 400 }
      );
    }

    await prisma.organization.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/organizations] DELETE [id] error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении организации" },
      { status: 500 }
    );
  }
}

/**
 * Рекурсивно обновляет уровни дочерних организаций
 */
async function updateChildrenLevels(parentId: string, baseLevel: number) {
  const children = await prisma.organization.findMany({
    where: { parentId: parentId },
  });

  for (const child of children) {
    const parent = await prisma.organization.findUnique({
      where: { id: parentId },
      select: { fullPath: true },
    });

    await prisma.organization.update({
      where: { id: child.id },
      data: {
        level: baseLevel,
        fullPath: parent?.fullPath ? `${parent.fullPath} / ${child.name}` : child.name,
      },
    });

    // Рекурсивно обновляем детей
    await updateChildrenLevels(child.id, baseLevel + 1);
  }
}

/**
 * Рекурсивно обновляет fullPath для всех дочерних организаций
 */
async function updateChildrenFullPath(parentId: string, parentFullPath: string) {
  const children = await prisma.organization.findMany({
    where: { parentId: parentId },
  });

  for (const child of children) {
    const newFullPath = `${parentFullPath} / ${child.name}`;
    
    await prisma.organization.update({
      where: { id: child.id },
      data: {
        fullPath: newFullPath,
      },
    });

    // Рекурсивно обновляем детей
    await updateChildrenFullPath(child.id, newFullPath);
  }
}

