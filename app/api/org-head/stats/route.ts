import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead, getChildOrganizationIds } from "@/lib/ppo-head-utils";

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

    // Получаем все подчинённые организации
    const childIds = await getChildOrganizationIds(orgHead.organizationId);
    const allOrgIds = [orgHead.organizationId, ...childIds];

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
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Организации без отчёта за текущий период
    const orgsWithReport = await prisma.report.findMany({
      where: {
        organizationId: { in: allOrgIds },
        period: currentPeriod,
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
