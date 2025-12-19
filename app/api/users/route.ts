import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCache, getCacheKey } from "@/lib/cache";
import * as Sentry from "@sentry/nextjs";

// GET - получение списка пользователей с поиском (только внутри организации пользователя)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем организацию текущего пользователя
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });

    const userOrganizationId = currentUser?.organizationId;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    let limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Строим условия поиска
    const where: any = {
      id: {
        not: session.user.id, // Исключаем текущего пользователя
      },
      role: {
        not: "SUPER_ADMIN",
      },
      // ВАЖНО: Показываем только пользователей из той же организации
      ...(userOrganizationId ? {
        organizationId: userOrganizationId,
      } : {}),
    };

    // Поиск по полям пользователя
    if (search) {
      const searchTrimmed = search.trim();
      // Используем contains для полнотекстового поиска
      where.OR = [
        { firstName: { contains: searchTrimmed, mode: "insensitive" } },
        { lastName: { contains: searchTrimmed, mode: "insensitive" } },
        { middleName: { contains: searchTrimmed, mode: "insensitive" } },
        { email: { contains: searchTrimmed, mode: "insensitive" } },
        { phone: { contains: searchTrimmed, mode: "insensitive" } },
      ];
      // Ограничиваем результаты при поиске для производительности
      if (limit > 50) {
        limit = 50;
      }
    }

    // Кешируем запрос пользователей на 2 минуты (данные меняются редко)
    const cacheKey = getCacheKey("users:list", { search, organizationId: userOrganizationId || "none", page, limit });
    
    const result = await Sentry.startSpan(
      {
        op: "db.query",
        name: "GET /api/users - fetch users",
      },
      async (span) => {
        span.setAttribute("search", search);
        span.setAttribute("organizationId", userOrganizationId || "none");
        span.setAttribute("page", page);
        span.setAttribute("limit", limit);
        
        return await withCache(
          cacheKey,
          async () => {
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

            return { users, total };
          },
          120 // 2 минуты
        );
      }
    );

    const { users, total } = result;

    // Преобразуем даты в ISO строки для корректной сериализации
    const serializedUsers = users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    }));

    return NextResponse.json({
      users: serializedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error("[users] GET Error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

