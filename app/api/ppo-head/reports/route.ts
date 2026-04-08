/**
 * API для управления отчётами организации
 * GET /api/ppo-head/reports - список отчётов
 * POST /api/ppo-head/reports - создание нового отчёта
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { isDemoUserId, getDemoReports } from "@/lib/demo";

// GET - список отчётов организации
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (isDemoUserId(session.user.id)) {
      const reports = getDemoReports();
      return NextResponse.json({ reports, total: reports.length });
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const year = searchParams.get("year");
    const templateId = searchParams.get("templateId");
    const includeChildren = searchParams.get("includeChildren") === "true";

    // Получаем ID дочерних организаций если нужно
    let organizationIds = [organizationId];
    
    if (includeChildren && access.isChairman) {
      const childOrgs = await prisma.organization.findMany({
        where: { parentId: organizationId },
        select: { id: true },
      });
      organizationIds = [...organizationIds, ...childOrgs.map((o) => o.id)];
    }

    const reports = await prisma.report.findMany({
      where: {
        organizationId: { in: organizationIds },
        ...(status && { status: status as any }),
        ...(year && { periodYear: parseInt(year) }),
        ...(templateId && { templateId }),
      },
      include: {
        template: {
          select: {
            code: true,
            name: true,
            periodicity: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ periodYear: "desc" }, { updatedAt: "desc" }],
    });

    // Добавляем информацию о сроках
    const currentDate = new Date();
    const reportsWithDeadlineInfo = reports.map((report) => {
      let deadlineStatus: "ok" | "warning" | "overdue" = "ok";
      let daysLeft: number | null = null;

      if (report.deadline) {
        const deadline = new Date(report.deadline);
        const diffTime = deadline.getTime() - currentDate.getTime();
        daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysLeft < 0) {
          deadlineStatus = "overdue";
        } else if (daysLeft <= 7) {
          deadlineStatus = "warning";
        }
      }

      return {
        ...report,
        deadlineStatus,
        daysLeft,
      };
    });

    return NextResponse.json({ reports: reportsWithDeadlineInfo });
  } catch (error) {
    console.error("[API] Error fetching reports:", error);
    return NextResponse.json(
      { error: "Ошибка при получении отчётов" },
      { status: 500 }
    );
  }
}

// POST - создать новый отчёт
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const access = await checkUserPermissions(session.user.id, "reports_create");
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "reports_create",
          denyReason: access.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;

    const body = await request.json();
    const { templateId, periodYear, periodMonth } = body;

    if (!templateId || !periodYear) {
      return NextResponse.json(
        { error: "Укажите шаблон и год отчёта" },
        { status: 400 }
      );
    }

    // Проверяем что шаблон существует
    const template = await prisma.reportTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }

    // Проверяем что отчёт за этот период ещё не создан
    const existingReport = await prisma.report.findFirst({
      where: {
        templateId,
        organizationId,
        periodYear,
        periodMonth: periodMonth || null,
      },
    });

    if (existingReport) {
      return NextResponse.json(
        { error: "Отчёт за этот период уже существует", reportId: existingReport.id },
        { status: 400 }
      );
    }

    // Получаем данные организации для автозаполнения
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        parent: {
          select: { name: true },
        },
      },
    });

    // Создаём начальные данные с автозаполнением
    const templateWithFields = await prisma.reportTemplate.findUnique({
      where: { id: templateId },
      include: {
        sections: {
          include: {
            fields: true,
          },
        },
      },
    });

    const initialData: Record<string, any> = {};

    if (templateWithFields && organization) {
      for (const section of templateWithFields.sections) {
        for (const field of section.fields) {
          if (field.autoFillFrom) {
            const value = getAutoFillValue(organization, field.autoFillFrom);
            if (value) {
              initialData[field.code] = value;
            }
          }
        }
      }
    }

    // Вычисляем дедлайн (10-е число следующего месяца после периода)
    let deadline: Date | null = null;
    if (template.periodicity === "ANNUAL") {
      deadline = new Date(periodYear + 1, 0, 10); // 10 января следующего года
    } else if (template.periodicity === "QUARTERLY" && periodMonth) {
      const quarterEnd = Math.ceil(periodMonth / 3) * 3;
      deadline = new Date(periodYear, quarterEnd, 10);
    } else if (template.periodicity === "MONTHLY" && periodMonth) {
      deadline = new Date(periodYear, periodMonth, 10);
    }

    const report = await prisma.report.create({
      data: {
        templateId,
        organizationId,
        periodYear,
        periodMonth: periodMonth || null,
        status: "DRAFT",
        data: initialData,
        deadline,
        filledByUserId: session.user.id,
      },
      include: {
        template: {
          select: { code: true, name: true },
        },
      },
    });

    // Создаём запись в истории статусов
    await prisma.reportStatusHistory.create({
      data: {
        reportId: report.id,
        fromStatus: null,
        toStatus: "DRAFT",
        changedByUserId: session.user.id,
        comment: "Отчёт создан",
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating report:", error);
    return NextResponse.json(
      { error: "Ошибка при создании отчёта" },
      { status: 500 }
    );
  }
}

/**
 * Получить значение для автозаполнения из данных организации
 */
function getAutoFillValue(organization: any, path: string): string | null {
  const parts = path.split(".");
  let value: any = organization;

  for (const part of parts) {
    if (part === "organization") continue;
    if (value && typeof value === "object" && part in value) {
      value = value[part];
    } else {
      return null;
    }
  }

  return typeof value === "string" ? value : null;
}
