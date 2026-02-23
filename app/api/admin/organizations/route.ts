import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrganizationType } from "@prisma/client";

/**
 * GET /api/admin/organizations
 * Получить список всех организаций с иерархией
 */
export async function GET(request: NextRequest) {
  try {
    console.log("[admin/organizations] GET request received");
    
    const session = await getServerSession(authOptions);
    console.log("[admin/organizations] Session:", session?.user?.id ? "authenticated" : "not authenticated");

    if (!session?.user?.id) {
      console.log("[admin/organizations] No session, returning 401");
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    console.log("[admin/organizations] User role:", user?.role);

    if (user?.role !== "SUPER_ADMIN") {
      console.log("[admin/organizations] Access denied, user role:", user?.role);
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as OrganizationType | null;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const search = searchParams.get("search")?.trim() || null;

    const where: any = {};
    if (type) {
      where.type = type;
    }
    if (!includeInactive) {
      where.isActive = true;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { chairmanName: { contains: search, mode: "insensitive" } },
        ...(search.replace(/\D/g, "").length >= 4 ? [{ inn: { contains: search } }] : []),
      ];
    }
    console.log("[admin/organizations] Query params:", { type, includeInactive, search: !!search, where });

    const organizations = await prisma.organization.findMany({
      where,
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
            name: "asc",
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: [
        { level: "asc" },
        { name: "asc" },
      ],
    });

    console.log("[admin/organizations] Successfully loaded", organizations.length, "organizations");
    return NextResponse.json({ organizations });
  } catch (error: any) {
    console.error("[admin/organizations] GET error:", error);
    console.error("[admin/organizations] GET error details:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.substring(0, 500),
    });
    return NextResponse.json(
      { 
        error: "Ошибка при получении организаций",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/organizations
 * Создать новую организацию
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
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
      isActive = true,
    } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "Необходимо указать название и тип организации" },
        { status: 400 }
      );
    }

    // Определяем уровень в иерархии
    let level = 0;
    let fullPath = name;
    if (parentId) {
      const parent = await prisma.organization.findUnique({
        where: { id: parentId },
        select: { level: true, fullPath: true },
      });
      if (parent) {
        level = parent.level + 1;
        fullPath = parent.fullPath ? `${parent.fullPath} / ${name}` : name;
      }
    }

    // Определяем порядок сортировки
    const maxSortOrder = await prisma.organization.findFirst({
      where: { parentId: parentId || null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (maxSortOrder?.sortOrder || 0) + 1;

    const organization = await prisma.organization.create({
      data: {
        name,
        type: type as OrganizationType,
        parentId: parentId || null,
        level,
        fullPath,
        sortOrder,
        inn: inn?.trim() || null,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        chairmanName: chairmanName?.trim() || null,
        chairmanJobTitle: chairmanJobTitle?.trim() || null,
        isActive,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    console.error("[admin/organizations] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при создании организации" },
      { status: 500 }
    );
  }
}

