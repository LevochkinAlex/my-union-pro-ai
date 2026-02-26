import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

/**
 * GET /api/org-head/reports
 * Получение списка отчётов для руководителя любого уровня (ППО/МПО/РПО)
 * 
 * Query params:
 * - status: фильтр по статусу
 * - period: период (YYYY-MM)
 * - organizationId: фильтр по конкретной организации (для МПО/РПО)
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const period = searchParams.get("period");
    const periodicity = searchParams.get("periodicity");
    const filterOrgId = searchParams.get("organizationId");

    let organizationIds = scope.organizationIds;
    if (filterOrgId) {
      if (!organizationIds.includes(filterOrgId)) {
        return NextResponse.json(
          { error: "Нет доступа к отчётам этой организации" },
          { status: 403 }
        );
      }
      organizationIds = [filterOrgId];
    }

    const where: any = { organizationId: { in: organizationIds } };
    if (status) where.status = status;
    if (period) {
      const [yearStr, monthStr] = period.split("-");
      where.periodYear = parseInt(yearStr);
      if (monthStr) where.periodMonth = parseInt(monthStr);
    }
    if (periodicity === "monthly") where.periodMonth = { not: null };
    else if (periodicity === "annual") where.periodMonth = null;

    const whereScope = { organizationId: { in: organizationIds } };

    // Параллельно: отчёты, статистика по статусам, по организациям (для МПО/РПО)
    const [reports, statusStats, rawOrgStatsOrNull] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              type: true,
              chairmanName: true,
            },
          },
          template: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: [
          { periodYear: "desc" },
          { periodMonth: "desc" },
          { createdAt: "desc" },
        ],
      }),
      prisma.report.groupBy({
        by: ["status"],
        where: whereScope,
        _count: { status: true },
      }),
      scope.level !== "PPO"
        ? prisma.report.groupBy({
            by: ["organizationId"],
            where: whereScope,
            _count: true,
          })
        : Promise.resolve(null),
    ]);

    let orgStats: any[] = [];
    if (scope.level !== "PPO" && rawOrgStatsOrNull && rawOrgStatsOrNull.length > 0) {
      const orgIds = rawOrgStatsOrNull.map((s) => s.organizationId);
      const orgs = await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true, type: true },
      });
      const orgMap = new Map(orgs.map((o) => [o.id, o]));
      orgStats = rawOrgStatsOrNull.map((s) => ({
        organizationId: s.organizationId,
        count: s._count,
        organization: orgMap.get(s.organizationId),
      }));
    }

    return NextResponse.json({
      reports,
      level: scope.level,
      organization: orgHead.organization,
      stats: {
        byStatus: statusStats.reduce((acc, s) => {
          acc[s.status] = s._count.status;
          return acc;
        }, {} as Record<string, number>),
        byOrganization: orgStats,
        total: reports.length,
      },
    });
  } catch (error: any) {
    console.error("[org-head/reports] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении отчётов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
