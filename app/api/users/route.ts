import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - получение списка пользователей с поиском и фильтрацией
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const organizationId = searchParams.get("organizationId") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Строим условия поиска
    const where: any = {
      id: {
        not: session.user.id, // Исключаем текущего пользователя
      },
      role: {
        not: "SUPER_ADMIN",
      },
    };

    // Поиск по имени, фамилии, отчеству, email или телефону
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { middleName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    // Фильтр по организации
    if (organizationId) {
      where.organizationId = organizationId;
    }

    // Получаем пользователей
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          email: true,
          avatarUrl: true,
          phone: true,
          jobTitle: true,
          profession: true,
          createdAt: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Получаем список организаций для фильтра
    const organizations = await prisma.organization.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      organizations,
    });
  } catch (error) {
    console.error("[users] GET Error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

