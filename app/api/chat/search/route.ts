import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - поиск пользователей для чата
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const organizationId = searchParams.get("organizationId") || "";

    if (!search && !organizationId) {
      return NextResponse.json({ users: [] });
    }

    // Строим условия поиска
    const where: any = {
      id: {
        not: session.user.id, // Исключаем текущего пользователя
      },
      role: {
        not: "SUPER_ADMIN",
      },
    };

    // Поиск по имени, email или телефону
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
    const users = await prisma.user.findMany({
      where,
      take: 20,
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
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[chat/search] GET Error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

