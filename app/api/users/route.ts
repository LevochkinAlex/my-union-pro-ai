import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCache, getCacheKey } from "@/lib/cache";
import * as Sentry from "@sentry/nextjs";

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
    };

    // Оптимизированный поиск: используем startsWith для более быстрого поиска
    // и только если нужно - contains для более глубокого поиска
    if (search) {
      const searchLower = search.toLowerCase().trim();
      // Если поиск короткий (1-2 символа), используем startsWith для производительности
      // Если длиннее - используем contains, но ограничиваем результаты
      if (searchLower.length <= 2) {
        where.OR = [
          { firstName: { startsWith: search, mode: "insensitive" } },
          { lastName: { startsWith: search, mode: "insensitive" } },
          { middleName: { startsWith: search, mode: "insensitive" } },
          { email: { startsWith: search, mode: "insensitive" } },
          { phone: { startsWith: search, mode: "insensitive" } },
        ];
      } else {
        // Для длинных запросов используем contains, но с ограничением результатов
        where.OR = [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { middleName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ];
        // Ограничиваем результаты при поиске для производительности
        if (limit > 50) {
          limit = 50;
        }
      }
    }

    // Фильтр по организации
    if (organizationId) {
      where.organizationId = organizationId;
    }

    // Кешируем запрос пользователей на 2 минуты (данные меняются редко)
    const cacheKey = getCacheKey("users:list", { search, organizationId, page, limit });
    
    const result = await Sentry.startSpan(
      {
        op: "db.query",
        name: "GET /api/users - fetch users",
      },
      async (span) => {
        span.setAttribute("search", search);
        span.setAttribute("organizationId", organizationId || "all");
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

            // Получаем список организаций для фильтра (кешируем отдельно на 10 минут)
            const orgCacheKey = getCacheKey("organizations:list", {});
            const organizations = await withCache(
              orgCacheKey,
              async () => {
                return await prisma.organization.findMany({
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
              },
              600 // 10 минут
            );

            return { users, total, organizations };
          },
          120 // 2 минуты
        );
      }
    );

    const { users, total, organizations } = result;

    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      organizations,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error("[users] GET Error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

