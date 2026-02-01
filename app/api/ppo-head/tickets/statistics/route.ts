import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Получить организацию пользователя (как Председатель или сотрудник) — та же логика, что в отчётах
 */
async function getUserOrganization(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isPPOHead: true,
      ppoHeadOrganizationId: true,
      viewMode: true,
    },
  });

  if (user?.isPPOHead && user.ppoHeadOrganizationId && user.viewMode === "PPO_HEAD") {
    return user.ppoHeadOrganizationId;
  }

  const staffPosition = await prisma.organizationStaff.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    select: { organizationId: true },
  });

  return staffPosition?.organizationId || null;
}

/**
 * GET /api/ppo-head/tickets/statistics
 * Статистика по обращениям для отчётности председателя/сотрудника организации
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const organizationId = await getUserOrganization(session.user.id);

    if (!organizationId) {
      return NextResponse.json({
        period: { year: new Date().getFullYear(), month: undefined },
        statistics: {
          total: 0,
          resolved: 0,
          pending: 0,
          inProgress: 0,
          rejected: 0,
          resolutionRate: 0,
          avgRating: null,
          ratedCount: 0,
          avgResolutionTime: null,
          byType: {},
          byPriority: {},
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          byMonth: Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [i + 1, { total: 0, resolved: 0 }])
          ),
        },
        recentRated: [],
      });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined;

    // Определяем период
    const startDate = month
      ? new Date(year, month - 1, 1)
      : new Date(year, 0, 1);
    const endDate = month
      ? new Date(year, month, 0, 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

    // Получаем все обращения организации за период
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        status: true,
        type: true,
        priority: true,
        resolved: true,
        resolvedAt: true,
        helpfulRating: true,
        helpfulRatingComment: true,
        helpfulRatingAt: true, // Добавляем поле для расчета времени решения
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Базовая статистика
    const total = tickets.length;
    // Решенные: статус RESOLVED или CLOSED, или есть оценка (helpfulRating), или флаг resolved = true
    const resolved = tickets.filter((t) => 
      t.status === "RESOLVED" || 
      t.status === "CLOSED" || 
      t.resolved === true || 
      t.helpfulRating !== null
    ).length;
    const pending = tickets.filter((t) => t.status === "PENDING").length;
    const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
    const rejected = tickets.filter((t) => t.status === "REJECTED").length;

    // Статистика по оценкам
    const rated = tickets.filter((t) => t.helpfulRating !== null);
    const avgRating = rated.length > 0
      ? (rated.reduce((sum, t) => sum + (t.helpfulRating || 0), 0) / rated.length).toFixed(1)
      : null;
    
    const ratingDistribution = {
      1: rated.filter((t) => t.helpfulRating === 1).length,
      2: rated.filter((t) => t.helpfulRating === 2).length,
      3: rated.filter((t) => t.helpfulRating === 3).length,
      4: rated.filter((t) => t.helpfulRating === 4).length,
      5: rated.filter((t) => t.helpfulRating === 5).length,
    };

    // Статистика по типам обращений
    const byType = tickets.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Статистика по приоритетам
    const byPriority = tickets.reduce((acc, t) => {
      acc[t.priority] = (acc[t.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Среднее время решения (в днях)
    // Используем resolvedAt, если есть, иначе helpfulRatingAt (когда обращение закрыто с оценкой)
    const resolvedTickets = tickets.filter((t) => 
      (t.resolved && t.resolvedAt) || 
      (t.helpfulRating !== null && t.helpfulRatingAt)
    );
    const avgResolutionTime = resolvedTickets.length > 0
      ? Math.round(
          resolvedTickets.reduce((sum, t) => {
            const created = new Date(t.createdAt).getTime();
            // Используем resolvedAt если есть, иначе helpfulRatingAt
            const resolvedDate = t.resolvedAt 
              ? new Date(t.resolvedAt).getTime() 
              : (t.helpfulRatingAt ? new Date(t.helpfulRatingAt).getTime() : created);
            return sum + (resolvedDate - created) / (1000 * 60 * 60 * 24);
          }, 0) / resolvedTickets.length
        )
      : null;

    // Статистика по месяцам (для годового отчёта)
    const byMonth: Record<number, { total: number; resolved: number }> = {};
    if (!month) {
      for (let m = 0; m < 12; m++) {
        byMonth[m + 1] = { total: 0, resolved: 0 };
      }
      tickets.forEach((t) => {
        const ticketMonth = new Date(t.createdAt).getMonth() + 1;
        byMonth[ticketMonth].total++;
        // Решенные: статус RESOLVED или CLOSED, или есть оценка, или флаг resolved = true
        if (t.status === "RESOLVED" || 
            t.status === "CLOSED" || 
            t.resolved === true || 
            t.helpfulRating !== null) {
          byMonth[ticketMonth].resolved++;
        }
      });
    }

    // Последние закрытые обращения с оценками
    const recentRated = rated
      .sort((a, b) => {
        const aDate = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
        const bDate = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        rating: t.helpfulRating,
        comment: t.helpfulRatingComment,
        user: `${t.user.firstName || ""} ${t.user.lastName || ""}`.trim() || "Пользователь",
        resolvedAt: t.resolvedAt,
      }));

    return NextResponse.json({
      period: { year, month },
      statistics: {
        total,
        resolved,
        pending,
        inProgress,
        rejected,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
        avgRating,
        ratedCount: rated.length,
        avgResolutionTime,
        byType,
        byPriority,
        ratingDistribution,
        byMonth: month ? null : byMonth,
      },
      recentRated,
    });
  } catch (error: any) {
    console.error("[ppo-head/tickets/statistics] Error:", error);
    return NextResponse.json(
      { error: "Ошибка получения статистики", details: error.message },
      { status: 500 }
    );
  }
}
