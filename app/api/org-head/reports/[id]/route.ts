/**
 * GET /api/org-head/reports/[id]
 * Просмотр отчёта руководителем МПО/РПО (доступ к отчётам подчинённых организаций)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { getChildOrganizationIds } from "@/lib/ppo-head-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Только МПО и РПО могут просматривать отчёты подчинённых
    if (orgHead.level === "PPO") {
      return NextResponse.json(
        { error: "Используйте кабинет ППО для просмотра отчётов" },
        { status: 403 }
      );
    }

    const childIds = await getChildOrganizationIds(orgHead.organizationId);
    const allowedOrgIds = [orgHead.organizationId, ...childIds];

    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        template: {
          include: {
            sections: {
              orderBy: { order: "asc" },
              include: {
                fields: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
            address: true,
            phone: true,
            email: true,
            chairmanName: true,
            parent: {
              select: { name: true },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        childReports: {
          select: {
            id: true,
            status: true,
            organization: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
    }

    if (!allowedOrgIds.includes(report.organizationId)) {
      return NextResponse.json(
        { error: "Нет доступа к этому отчёту" },
        { status: 403 }
      );
    }

    // Руководитель МПО/РПО может только утверждать/отклонять, не редактировать
    const canEdit = false;
    const canApprove =
      report.organizationId !== orgHead.organizationId &&
      report.status === "SUBMITTED";

    return NextResponse.json({
      report,
      canEdit,
      canApprove,
    });
  } catch (error) {
    console.error("[org-head/reports/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении отчёта" },
      { status: 500 }
    );
  }
}
