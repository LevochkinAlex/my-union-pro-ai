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

    const scope = await getOrgHeadScope(session.user.id, orgHead);
    if (!scope) {
      return NextResponse.json(
        { error: "Вы не являетесь руководителем организации" },
        { status: 403 }
      );
    }

    const allOrgIds = scope.organizationIds;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

    // Параллельно: организации + счётчики + отчёты за период + тикеты + активность + 12 помесячных count
    const [
      organizations,
      totalMembers,
      reportStats,
      orgsWithReport,
      ticketStats,
      newMembersCount,
      newReportsCount,
      newTicketsCount,
      ...timeSeriesCounts
    ] = await Promise.all([
      prisma.organization.findMany({
        where: { id: { in: allOrgIds } },
        select: {
          id: true,
          name: true,
          type: true,
          chairmanName: true,
          chairmanJobTitle: true,
          parentId: true,
          totalEmployees: true,
          _count: {
            select: {
              members: true,
              reports: true,
              documents: true,
              tickets: true,
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          organizationId: { in: allOrgIds },
          membershipStatus: "APPROVED",
        },
      }),
      prisma.report.groupBy({
        by: ["status"],
        where: { organizationId: { in: allOrgIds } },
        _count: { status: true },
      }),
      prisma.report.findMany({
        where: {
          organizationId: { in: allOrgIds },
          periodYear: currentYear,
          periodMonth: currentMonth,
        },
        select: { organizationId: true },
        distinct: ["organizationId"],
      }),
      prisma.ticket.groupBy({
        by: ["status"],
        where: { organizationId: { in: allOrgIds } },
        _count: { status: true },
      }),
      prisma.user.count({
        where: {
          organizationId: { in: allOrgIds },
          membershipStatus: "APPROVED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.report.count({
        where: {
          organizationId: { in: allOrgIds },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.ticket.count({
        where: {
          organizationId: { in: allOrgIds },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      ...Array.from({ length: 12 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (11 - i));
        const year = date.getFullYear();
        const month = date.getMonth();
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
        return prisma.user.count({
          where: {
            organizationId: { in: allOrgIds },
            membershipStatus: "APPROVED",
            createdAt: { lte: endOfMonth },
          },
        });
      }),
    ]);

    const currentTotalEmployees = organizations.reduce((sum, o) => sum + (o.totalEmployees || 0), 0);
    const orgsWithReportIds = orgsWithReport.map((r) => r.organizationId);
    const orgsWithoutReport = organizations.filter(
      (o) => !orgsWithReportIds.includes(o.id) && o.id !== orgHead.organizationId
    );

    const timeSeriesData = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - i));
      const year = date.getFullYear();
      const month = date.getMonth();
      const membersCount = timeSeriesCounts[i] ?? 0;
      const percent = currentTotalEmployees > 0 ? Math.round((membersCount / currentTotalEmployees) * 100) : 0;
      return {
        period: `${year}-${String(month + 1).padStart(2, "0")}`,
        month: monthNames[month],
        year,
        totalMembers: membersCount,
        totalEmployees: currentTotalEmployees,
        membershipPercent: percent,
      };
    });

    const recentActivity = {
      newMembers: newMembersCount,
      newReports: newReportsCount,
      newTickets: newTicketsCount,
    };

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
        chairmanJobTitle: o.chairmanJobTitle,
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
