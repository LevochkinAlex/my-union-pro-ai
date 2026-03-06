import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCache, getCacheKey } from "@/lib/cache";
import * as Sentry from "@sentry/nextjs";
import { isDemoUserId } from "@/lib/demo";
import { getDemoProfsetyUsers } from "@/lib/demo";
import { getChildOrganizationIds } from "@/lib/ppo-head-utils";

// GET - получение списка пользователей с поиском (только внутри организации пользователя)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    let limit = parseInt(searchParams.get("limit") || "20");

    // Исключённый: доступ к Профсети закрыт
    const userForExcluded = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { membershipStatus: true, unionMembershipStatus: true },
    });
    const isExcluded = userForExcluded?.membershipStatus === "EXCLUDED" || userForExcluded?.unionMembershipStatus === "REMOVED";
    const isReApplying = userForExcluded?.unionMembershipStatus === "REMOVED" &&
      (userForExcluded?.membershipStatus === "DOCUMENTS_PENDING" || userForExcluded?.membershipStatus === "PROFILE_INCOMPLETE");
    if (isExcluded && !isReApplying) {
      return NextResponse.json(
        { error: "Доступ к Профсети закрыт. Вы исключены из профсоюза." },
        { status: 403 }
      );
    }

    // Демо: мок-пользователи Профсети без БД
    if (isDemoUserId(session.user.id)) {
      const { users, total } = getDemoProfsetyUsers({
        search,
        page,
        limit,
        excludeUserId: session.user.id,
      });
      return NextResponse.json({
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      });
    }

    // Получаем организацию текущего пользователя (учитываем председателей и руководителей)
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        organizationId: true,
        ppoHeadOrganizationId: true,
        mpoHeadOrganizationId: true,
        rpoHeadOrganizationId: true,
        viewMode: true,
      },
    });

    const viewMode = currentUser?.viewMode;
    const rpoOrgId = currentUser?.rpoHeadOrganizationId;
    const mpoOrgId = currentUser?.mpoHeadOrganizationId;
    const isOrgHead = (viewMode === "RPO_HEAD" && rpoOrgId) || (viewMode === "MPO_HEAD" && mpoOrgId);

    let orgFilter: any = {};
    let orgFilterKey = "none";

    if (isOrgHead) {
      const headOrgId = rpoOrgId || mpoOrgId!;
      const childIds = await getChildOrganizationIds(headOrgId);
      const allOrgIds = [headOrgId, ...childIds];
      orgFilter = { organizationId: { in: allOrgIds } };
      orgFilterKey = `orgHead:${headOrgId}`;
    } else {
      const userOrganizationId =
        currentUser?.ppoHeadOrganizationId ||
        currentUser?.organizationId ||
        null;
      if (userOrganizationId) {
        orgFilter = { organizationId: userOrganizationId };
        orgFilterKey = userOrganizationId;
      } else {
        orgFilter = { organizationId: "___none___" };
        orgFilterKey = "empty";
      }
    }

    const skip = (page - 1) * limit;

    const where: any = {
      id: {
        not: session.user.id,
      },
      role: {
        not: "SUPER_ADMIN",
      },
      membershipStatus: "APPROVED",
      ...orgFilter,
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
    const cacheKey = getCacheKey("users:list", { search, organizationId: orgFilterKey, page, limit });
    
    const result = await Sentry.startSpan(
      {
        op: "db.query",
        name: "GET /api/users - fetch users",
      },
      async (span) => {
        span.setAttribute("search", search);
        span.setAttribute("organizationId", orgFilterKey);
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
    // Проверяем тип, так как из кеша может прийти уже строка
    const serializedUsers = users.map((user) => ({
      ...user,
      createdAt: user.createdAt instanceof Date 
        ? user.createdAt.toISOString() 
        : typeof user.createdAt === 'string' 
          ? user.createdAt 
          : new Date(user.createdAt).toISOString(),
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

