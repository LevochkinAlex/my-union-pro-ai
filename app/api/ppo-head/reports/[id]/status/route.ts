/**
 * API для изменения статуса отчёта
 * POST /api/ppo-head/reports/[id]/status
 * 
 * Workflow:
 * DRAFT -> SUBMITTED (отправить на согласование)
 * SUBMITTED -> APPROVED (согласовать) или REVISION (вернуть на доработку)
 * REVISION -> SUBMITTED (отправить повторно)
 * APPROVED -> CONFIRMED (утвердить окончательно)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { ReportStatus } from "@prisma/client";

type StatusAction = "submit" | "approve" | "reject" | "confirm";

const ALLOWED_TRANSITIONS: Record<ReportStatus, StatusAction[]> = {
  DRAFT: ["submit"],
  SUBMITTED: ["approve", "reject"],
  REVISION: ["submit"],
  APPROVED: ["confirm"],
  CONFIRMED: [],
};

const STATUS_MAP: Record<StatusAction, ReportStatus> = {
  submit: "SUBMITTED",
  approve: "APPROVED",
  reject: "REVISION",
  confirm: "CONFIRMED",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { action, comment } = body as { action: StatusAction; comment?: string };

    if (!action || !["submit", "approve", "reject", "confirm"].includes(action)) {
      return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    }

    // Получаем отчёт
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            parentId: true,
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
    }

    // Проверяем что переход статуса разрешён
    const allowedActions = ALLOWED_TRANSITIONS[report.status];
    if (!allowedActions.includes(action)) {
      return NextResponse.json(
        { error: `Действие "${action}" недопустимо для статуса "${report.status}"` },
        { status: 400 }
      );
    }

    // Проверяем права в зависимости от действия
    let hasPermission = false;
    let permissions;

    if (action === "submit") {
      // Отправить может владелец отчёта
      permissions = await checkUserPermissions(session.user.id, "reports_create");
      hasPermission = 
        permissions.hasAccess && 
        permissions.organizationId === report.organizationId;
    } else if (action === "approve" || action === "reject") {
      // Согласовать/отклонить может вышестоящая организация
      permissions = await checkUserPermissions(session.user.id, "reports_view");
      
      // Проверяем что пользователь из родительской организации
      if (permissions.hasAccess && report.organization.parentId) {
        hasPermission = 
          permissions.organizationId === report.organization.parentId &&
          permissions.isChairman;
      }
    } else if (action === "confirm") {
      // Утвердить может вышестоящая организация после согласования
      permissions = await checkUserPermissions(session.user.id, "reports_view");
      
      if (permissions.hasAccess && report.organization.parentId) {
        hasPermission = 
          permissions.organizationId === report.organization.parentId &&
          permissions.isChairman;
      }
    }

    if (!hasPermission) {
      return NextResponse.json(
        { error: "Недостаточно прав для этого действия" },
        { status: 403 }
      );
    }

    // Проверяем заполненность обязательных полей при отправке
    if (action === "submit") {
      const template = await prisma.reportTemplate.findUnique({
        where: { id: report.templateId },
        include: {
          sections: {
            include: {
              fields: {
                where: { isRequired: true },
              },
            },
          },
        },
      });

      if (template) {
        const data = (report.data as Record<string, any>) || {};
        const missingFields: string[] = [];

        for (const section of template.sections) {
          for (const field of section.fields) {
            const value = data[field.code];
            if (value === undefined || value === null || value === "") {
              missingFields.push(field.title);
            }
          }
        }

        if (missingFields.length > 0) {
          return NextResponse.json(
            { 
              error: "Не заполнены обязательные поля",
              missingFields,
            },
            { status: 400 }
          );
        }
      }
    }

    // При отклонении нужен комментарий
    if (action === "reject" && !comment) {
      return NextResponse.json(
        { error: "Укажите причину возврата на доработку" },
        { status: 400 }
      );
    }

    const newStatus = STATUS_MAP[action];

    // Обновляем статус отчёта
    const updateData: any = {
      status: newStatus,
    };

    if (action === "submit") {
      updateData.submittedAt = new Date();
      updateData.revisionReason = null;
    } else if (action === "approve") {
      updateData.approvedByUserId = session.user.id;
      updateData.approvedAt = new Date();
    } else if (action === "reject") {
      updateData.revisionReason = comment;
    } else if (action === "confirm") {
      updateData.confirmedByUserId = session.user.id;
      updateData.confirmedAt = new Date();
    }

    const updatedReport = await prisma.report.update({
      where: { id },
      data: updateData,
    });

    // Записываем в историю
    await prisma.reportStatusHistory.create({
      data: {
        reportId: id,
        fromStatus: report.status,
        toStatus: newStatus,
        changedByUserId: session.user.id,
        comment: comment || getDefaultComment(action),
      },
    });

    return NextResponse.json({ 
      report: updatedReport,
      message: getSuccessMessage(action),
    });
  } catch (error) {
    console.error("[API] Error changing report status:", error);
    return NextResponse.json(
      { error: "Ошибка при изменении статуса" },
      { status: 500 }
    );
  }
}

function getDefaultComment(action: StatusAction): string {
  switch (action) {
    case "submit":
      return "Отчёт отправлен на согласование";
    case "approve":
      return "Отчёт согласован";
    case "reject":
      return "Отчёт возвращён на доработку";
    case "confirm":
      return "Отчёт утверждён";
    default:
      return "";
  }
}

function getSuccessMessage(action: StatusAction): string {
  switch (action) {
    case "submit":
      return "Отчёт успешно отправлен на согласование";
    case "approve":
      return "Отчёт успешно согласован";
    case "reject":
      return "Отчёт возвращён на доработку";
    case "confirm":
      return "Отчёт успешно утверждён";
    default:
      return "Статус изменён";
  }
}
