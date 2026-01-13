import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead, getChildOrganizationIds } from "@/lib/ppo-head-utils";
import { sendUserNotification } from "@/lib/notifications";

/**
 * POST /api/org-head/reports/[id]/approve
 * Утверждение или отклонение отчёта руководителем МПО/РПО
 * 
 * Body:
 * - action: "approve" | "reject"
 * - comment?: string - комментарий (обязателен при отклонении)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, comment } = body;

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Некорректное действие. Допустимые: approve, reject" },
        { status: 400 }
      );
    }

    if (action === "reject" && !comment) {
      return NextResponse.json(
        { error: "При отклонении необходимо указать комментарий" },
        { status: 400 }
      );
    }

    // Получаем данные руководителя
    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json(
        { error: "Вы не являетесь руководителем организации" },
        { status: 403 }
      );
    }

    // Только МПО и РПО могут утверждать отчёты
    if (orgHead.level === "PPO") {
      return NextResponse.json(
        { error: "Председатели ППО не могут утверждать отчёты других организаций" },
        { status: 403 }
      );
    }

    // Получаем отчёт
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            parentId: true,
          },
        },
      },
    });
    
    // Получаем данные автора отчёта отдельно
    let submittedBy = null;
    if (report?.filledByUserId) {
      submittedBy = await prisma.user.findUnique({
        where: { id: report.filledByUserId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });
    }

    if (!report) {
      return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
    }

    // Проверяем, что отчёт принадлежит подчинённой организации
    const childIds = await getChildOrganizationIds(orgHead.organizationId);
    if (!childIds.includes(report.organizationId)) {
      return NextResponse.json(
        { error: "Нет доступа к этому отчёту" },
        { status: 403 }
      );
    }

    // Проверяем статус отчёта
    if (report.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Только отчёты со статусом 'На проверке' можно утверждать или отклонять" },
        { status: 400 }
      );
    }

    // Обновляем статус отчёта
    const newStatus = action === "approve" ? "APPROVED" : "REJECTED";
    
    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        status: newStatus,
        approvedByUserId: action === "approve" ? session.user.id : null,
        approvedAt: action === "approve" ? new Date() : null,
        revisionReason: action === "reject" ? comment : null,
        // Сохраняем комментарий в истории статусов
        statusHistory: {
          create: {
            fromStatus: report.status,
            toStatus: newStatus,
            changedByUserId: session.user.id,
            comment: comment || null,
          },
        },
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    // Уведомляем автора отчёта
    if (submittedBy) {
      const userName = [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") || "Руководитель";
      const actionText = action === "approve" ? "утверждён" : "отклонён";
      const periodStr = `${report.periodMonth ? report.periodMonth + "/" : ""}${report.periodYear}`;
      
      await sendUserNotification({
        userId: submittedBy.id,
        type: action === "approve" ? "report_approved" : "report_rejected",
        title: `Отчёт ${actionText}`,
        body: `Ваш отчёт за ${periodStr} был ${actionText} ${userName}.${comment ? ` Комментарий: ${comment}` : ""}`,
        data: {
          reportId: report.id,
          action,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "Отчёт утверждён" : "Отчёт отклонён",
      report: updatedReport,
    });
  } catch (error: any) {
    console.error("[org-head/reports/approve] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при обработке отчёта",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
