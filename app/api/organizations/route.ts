import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/organizations
 * Получает список всех активных организаций с иерархией
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Получаем все активные организации
    const organizations = await prisma.organization.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        inn: true,
        chairmanName: true,
      },
      orderBy: [
        { name: "asc" },
      ],
    });

    // Вычисляем уровень для каждой организации
    const orgMap = new Map(organizations.map(org => [org.id, org]));
    
    const getLevel = (org: typeof organizations[0]): number => {
      if (!org.parentId) return 0;
      const parent = orgMap.get(org.parentId);
      if (!parent) return 0;
      return getLevel(parent) + 1;
    };

    const getFullPath = (org: typeof organizations[0]): string => {
      if (!org.parentId) return org.name;
      const parent = orgMap.get(org.parentId);
      if (!parent) return org.name;
      return `${getFullPath(parent)} / ${org.name}`;
    };

    const orgsWithLevels = organizations.map(org => ({
      ...org,
      level: getLevel(org),
      fullPath: getFullPath(org),
    }));

    // Сортируем: сначала по уровню, потом по имени
    orgsWithLevels.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name, 'ru');
    });

    // Строим иерархическую структуру
    const buildTree = (parentId: string | null = null): any[] => {
      return orgsWithLevels
        .filter((org) => org.parentId === parentId)
        .map((org) => ({
          ...org,
          children: buildTree(org.id),
        }));
    };

    const tree = buildTree(null);

    // Также возвращаем плоский список для простого dropdown
    const flatList = orgsWithLevels.map((org) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      level: org.level,
      fullPath: org.fullPath,
      indentedName: "  ".repeat(org.level) + org.name, // Для визуального отступа
    }));

    return NextResponse.json({
      tree,
      flatList,
    });
  } catch (error) {
    console.error("[organizations] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении списка организаций" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations
 * Создает новую организацию (только для SUPER_ADMIN)
 */
export async function POST(request: NextRequest) {
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
    const { name, type, parentId, inn, address, phone, email, chairmanName, sortOrder } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Название и тип организации обязательны" },
        { status: 400 }
      );
    }

    // Определяем уровень и полный путь
    let level = 0;
    let fullPath = name;

    if (parentId) {
      const parent = await prisma.organization.findUnique({
        where: { id: parentId },
        select: { level: true, fullPath: true, name: true },
      });

      if (parent) {
        level = parent.level + 1;
        fullPath = `${parent.fullPath || parent.name} / ${name}`;
      }
    }

    // Создаем организацию
    const organization = await prisma.organization.create({
      data: {
        name,
        type,
        parentId: parentId || null,
        level,
        fullPath,
        sortOrder: sortOrder || 0,
        inn: inn || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        chairmanName: chairmanName || null,
      },
    });

    console.log("[organizations] Created:", organization.id, organization.name);

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error("[organizations] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при создании организации" },
      { status: 500 }
    );
  }
}

