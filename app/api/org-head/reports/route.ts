import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead, getChildOrganizationIds } from "@/lib/ppo-head-utils";

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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const period = searchParams.get("period");
    const filterOrgId = searchParams.get("organizationId");

    // Определяем организации, отчёты которых нужно показать
    let organizationIds: string[] = [];

    if (orgHead.level === "PPO") {
      // ППО видит только свои отчёты
      organizationIds = [orgHead.organizationId];
    } else {
      // МПО/РПО видит отчёты всех подчинённых организаций
      const childIds = await getChildOrganizationIds(orgHead.organizationId);
      organizationIds = [orgHead.organizationId, ...childIds];

      // Если указан фильтр по организации - проверяем доступ
      if (filterOrgId) {
        if (!organizationIds.includes(filterOrgId)) {
          return NextResponse.json(
            { error: "Нет доступа к отчётам этой организации" },
            { status: 403 }
          );
        }
        organizationIds = [filterOrgId];
      }
    }

    // Формируем условия запроса
    const where: any = {
      organizationId: { in: organizationIds },
    };

    if (status) {
      where.status = status;
    }

    if (period) {
      where.period = period;
    }

    // Получаем отчёты
    const reports = await prisma.report.findMany({
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
        submittedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { period: "desc" },
        { createdAt: "desc" },
      ],
    });

    // Статистика по статусам
    const statusStats = await prisma.report.groupBy({
      by: ["status"],
      where: { organizationId: { in: organizationIds } },
      _count: { status: true },
    });

    // Статистика по организациям (для МПО/РПО)
    let orgStats: any[] = [];
    if (orgHead.level !== "PPO") {
      orgStats = await prisma.report.groupBy({
        by: ["organizationId"],
        where: { organizationId: { in: organizationIds } },
        _count: { organizationId: true },
      });

      // Добавляем названия организаций
      const orgs = await prisma.organization.findMany({
        where: { id: { in: orgStats.map((s) => s.organizationId) } },
        select: { id: true, name: true, type: true },
      });

      orgStats = orgStats.map((s) => ({
        ...s,
        organization: orgs.find((o) => o.id === s.organizationId),
      }));
    }

    return NextResponse.json({
      reports,
      level: orgHead.level,
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
