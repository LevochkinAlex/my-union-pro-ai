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

    // Проверяем права доступа
    const permissions = await checkUserPermissions(session.user.id, "reports_view");
    
    if (!permissions.hasAccess) {
      return NextResponse.json(
        { error: "Нет доступа к отчётам" },
        { status: 403 }
      );
    }

    // Получаем организацию пользователя
    const organizationId = permissions.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Организация не найдена" },
        { status: 404 }
      );
    }

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

    // Фильтруем по типу организации
    const filteredTemplates = templates.filter((template) => {
      if (!template.forOrganizationTypes) return true;
      const types = template.forOrganizationTypes as string[];
      return types.includes(organization.type);
    });

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
