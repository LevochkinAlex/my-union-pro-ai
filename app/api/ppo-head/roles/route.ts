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

    // Проверяем права: только Председатель или сотрудник с правами
    let organizationId: string | null = null;

    if (user.isPPOHead && user.ppoHeadOrganizationId) {
      organizationId = user.ppoHeadOrganizationId;
    } else {
      // Проверяем, является ли пользователь сотрудником с правами staff_view
      const staffPosition = await prisma.organizationStaff.findFirst({
        where: {
          userId: user.id,
          status: "ACTIVE",
        },
        include: {
          role: true,
        },
      });

      if (staffPosition) {
        const permissions = staffPosition.role.permissions as any;
        if (permissions?.staff_view) {
          organizationId = staffPosition.organizationId;
        }
      }
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "Нет доступа к управлению ролями" },
        { status: 403 }
      );
    }

    // Получаем роли организации
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

    // Если ролей нет, создаем предустановленные
    if (roles.length === 0) {
      await createDefaultRolesForOrganization(organizationId);
      
      // Получаем созданные роли
      const newRoles = await prisma.staffRole.findMany({
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
      
      return NextResponse.json({
        roles: newRoles.map((r) => ({
          ...r,
          staffCount: r._count.staff,
        })),
      });
    }

    return NextResponse.json({
      roles: roles.map((r) => ({
        ...r,
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

    if (!user?.isPPOHead || !user.ppoHeadOrganizationId) {
      return NextResponse.json(
        { error: "Только Председатель может создавать роли" },
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
          organizationId: user.ppoHeadOrganizationId,
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
        organizationId: user.ppoHeadOrganizationId,
        name,
        description,
        permissions,
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
