/**
 * API для получения шаблонов отчётов
 * GET /api/ppo-head/reports/templates - список доступных шаблонов
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем данные пользователя напрямую из БД
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        viewMode: true,
      },
    });

    // Определяем организацию пользователя
    let organizationId: string | null = null;
    
    // Если пользователь - Председатель в режиме PPO_HEAD
    if (user?.isPPOHead && user.ppoHeadOrganizationId && user.viewMode === "PPO_HEAD") {
      organizationId = user.ppoHeadOrganizationId;
    } else {
      // Проверяем, является ли сотрудником
      const staffPosition = await prisma.organizationStaff.findFirst({
        where: {
          userId: session.user.id,
          status: "ACTIVE",
        },
        select: { organizationId: true },
      });
      organizationId = staffPosition?.organizationId || null;
    }

    if (!organizationId) {
      // Если нет привязки к организации, вернём все активные шаблоны
      const allTemplates = await prisma.reportTemplate.findMany({
        where: { isActive: true },
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
        orderBy: { code: "asc" },
      });

      return NextResponse.json({
        templates: allTemplates.map((t) => ({
          ...t,
          reportsCount: 0,
        })),
      });
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
