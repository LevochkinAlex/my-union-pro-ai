/**
 * API для получения шаблонов отчётов
 * GET /api/ppo-head/reports/templates - список доступных шаблонов
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const access = await checkUserPermissions(session.user.id, "reports_view");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "reports_view",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;

    // Получаем тип организации для фильтрации шаблонов
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { type: true },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Организация не найдена" },
        { status: 404 }
      );
    }

    // Получаем шаблоны, доступные для данного типа организации
    const templates = await prisma.reportTemplate.findMany({
      where: {
        isActive: true,
      },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: {
            fields: {
              orderBy: { order: "asc" },
            },
          },
        },
        _count: {
          select: {
            reports: {
              where: { organizationId },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    // Фильтруем по типу организации; если ни один не подошёл — возвращаем все активные (чтобы не было пустого списка из-за несовпадения типа)
    let filteredTemplates = templates.filter((template) => {
      if (!template.forOrganizationTypes) return true;
      const types = template.forOrganizationTypes as string[];
      return types.includes(organization.type);
    });
    if (filteredTemplates.length === 0 && templates.length > 0) {
      filteredTemplates = templates;
    }

    return NextResponse.json({
      templates: filteredTemplates.map((t) => ({
        ...t,
        reportsCount: t._count.reports,
      })),
    });
  } catch (error) {
    console.error("[API] Error fetching report templates:", error);
    return NextResponse.json(
      { error: "Ошибка при получении шаблонов" },
      { status: 500 }
    );
  }
}
