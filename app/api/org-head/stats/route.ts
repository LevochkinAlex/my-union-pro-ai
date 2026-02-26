import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

/**
 * GET /api/org-head/stats
 * Получение агрегированной статистики для руководителя любого уровня
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json(
        { error: "Вы не являетесь руководителем организации" },
        { status: 403 }
      );
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json(
        { error: "Вы не являетесь руководителем организации" },
        { status: 403 }
      );
    }

    const allOrgIds = scope.organizationIds;

    // Получаем статистику по организациям
    const organizations = await prisma.organization.findMany({
      where: { id: { in: allOrgIds } },
      select: {
        id: true,
        name: true,
        type: true,
        chairmanName: true,
        parentId: true,
        _count: {
          select: {
            members: true,
            reports: true,
            documents: true,
            tickets: true,
          },
        },
      },
    });

    // Общая статистика по членам
    const totalMembers = await prisma.user.count({
      where: {
        organizationId: { in: allOrgIds },
        membershipStatus: "APPROVED",
      },
    });

    // Статистика по отчётам
    const reportStats = await prisma.report.groupBy({
      by: ["status"],
      where: { organizationId: { in: allOrgIds } },
      _count: { status: true },
    });

    // Текущий период (для проверки сданных отчётов)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    // Организации без отчёта за текущий период
    const orgsWithReport = await prisma.report.findMany({
      where: {
        organizationId: { in: allOrgIds },
        periodYear: currentYear,
        periodMonth: currentMonth,
      },
      select: { organizationId: true },
      distinct: ["organizationId"],
    });

    const orgsWithReportIds = orgsWithReport.map((r) => r.organizationId);
    const orgsWithoutReport = organizations.filter(
      (o) => !orgsWithReportIds.includes(o.id) && o.id !== orgHead.organizationId
    );

    // Статистика по обращениям
    const ticketStats = await prisma.ticket.groupBy({
      by: ["status"],
      where: { organizationId: { in: allOrgIds } },
      _count: { status: true },
    });

    // Активность за последние 30 дней
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = {
      newMembers: await prisma.user.count({
        where: {
          organizationId: { in: allOrgIds },
          membershipStatus: "APPROVED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      newReports: await prisma.report.count({
        where: {
          organizationId: { in: allOrgIds },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      newTickets: await prisma.ticket.count({
        where: {
          organizationId: { in: allOrgIds },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    };

    // Временные ряды (последние 12 месяцев)
    // Данные по количеству членов и проценту членства по месяцам
    const timeSeriesData: Array<{
      period: string;
      month: string;
      year: number;
      totalMembers: number;
      totalEmployees: number;
      membershipPercent: number;
    }> = [];

    // Получаем общее количество работников из организаций
    const orgsWithEmployees = await prisma.organization.findMany({
      where: { id: { in: allOrgIds } },
      select: { totalEmployees: true },
    });
    const currentTotalEmployees = orgsWithEmployees.reduce((sum, o) => sum + (o.totalEmployees || 0), 0);

    // Генерируем данные для последних 12 месяцев
    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      
      // Считаем членов, которые были активны на конец месяца
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
      
      const membersCount = await prisma.user.count({
        where: {
          organizationId: { in: allOrgIds },
          membershipStatus: "APPROVED",
          createdAt: { lte: endOfMonth },
        },
      });

      // Для упрощения используем текущее количество работников 
      // (в реальной системе нужно хранить историю)
      const employeesCount = currentTotalEmployees;
      const percent = employeesCount > 0 ? Math.round((membersCount / employeesCount) * 100) : 0;

      timeSeriesData.push({
        period: `${year}-${String(month + 1).padStart(2, "0")}`,
        month: monthNames[month],
        year,
        totalMembers: membersCount,
        totalEmployees: employeesCount,
        membershipPercent: percent,
      });
    }

    // Формируем иерархию организаций
    const buildHierarchy = (parentId: string | null): any[] => {
      return organizations
        .filter((o) => o.parentId === parentId)
        .map((o) => ({
          ...o,
          children: buildHierarchy(o.id),
        }));
    };

    const hierarchy = buildHierarchy(
      orgHead.level === "RPO" || orgHead.level === "MPO"
        ? orgHead.organizationId
        : null
    );

    return NextResponse.json({
      level: orgHead.level,
      organization: orgHead.organization,
      stats: {
        totalOrganizations: allOrgIds.length,
        totalMembers,
        totalEmployees: currentTotalEmployees,
        membershipPercent: currentTotalEmployees > 0 ? Math.round((totalMembers / currentTotalEmployees) * 100) : 0,
        reports: {
          byStatus: reportStats.reduce((acc, s) => {
            acc[s.status] = s._count.status;
            return acc;
          }, {} as Record<string, number>),
          total: reportStats.reduce((sum, s) => sum + s._count.status, 0),
        },
        tickets: {
          byStatus: ticketStats.reduce((acc, s) => {
            acc[s.status] = s._count.status;
            return acc;
          }, {} as Record<string, number>),
          total: ticketStats.reduce((sum, s) => sum + s._count.status, 0),
        },
        currentPeriod,
        orgsWithoutReport: orgsWithoutReport.map((o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          chairmanName: o.chairmanName,
        })),
        recentActivity,
      },
      timeSeries: timeSeriesData,
      organizations: organizations.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        chairmanName: o.chairmanName,
        parentId: o.parentId,
        membersCount: o._count.members,
        reportsCount: o._count.reports,
        documentsCount: o._count.documents,
        ticketsCount: o._count.tickets,
      })),
      hierarchy,
    });
  } catch (error: any) {
    console.error("[org-head/stats] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении статистики",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
