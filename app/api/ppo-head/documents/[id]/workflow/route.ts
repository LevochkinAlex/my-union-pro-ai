import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";
import {
  type WorkflowAction,
  STATUS_ACTIONS,
  hasWorkflowActionPermission,
  getAllowedActionsForStatus,
  isWorkflowAction,
} from "@/lib/document-workflow-permissions";

/**
 * POST /api/ppo-head/documents/[id]/workflow
 * Изменить статус документа (workflow)
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

    const { id: documentId } = await params;

    const perm = await checkUserPermissions(session.user.id);
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          requiredPermission: "documents_view",
          denyReason: perm.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }
    const organizationId = perm.organizationId;
    const normalizedPermissions = normalizeStaffPermissions(perm.permissions);

    // Получаем документ
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        approvals: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!document || document.organizationId !== organizationId) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    const body = await request.json();
    const { action, comment, assignToUserId, approvers } = body as {
      action: WorkflowAction;
      comment?: string;
      assignToUserId?: string;
      approvers?: string[]; // ID пользователей для согласования
    };

    if (!action) {
      return NextResponse.json({ error: "Действие не указано" }, { status: 400 });
    }
    if (!isWorkflowAction(action)) {
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    // Проверяем права на действие
    if (!hasWorkflowActionPermission(normalizedPermissions, action)) {
      return NextResponse.json(
        { error: `Нет прав для действия: ${action}`, action },
        { status: 403 }
      );
    }

    // Определяем новый статус
    let newStatus: string;
    const currentStatus = document.status;

    switch (action) {
      case "submit_for_review":
        newStatus = "PENDING_REVIEW";
        break;
      case "submit_for_approval":
        newStatus = "PENDING_APPROVAL";
        break;
      case "approve":
        newStatus = "PENDING_SIGNATURE";
        break;
      case "reject":
        newStatus = "REJECTED";
        break;
      case "submit_for_signature":
        newStatus = "PENDING_SIGNATURE";
        break;
      case "sign":
        newStatus = "SIGNED";
        break;
      case "register":
        newStatus = "REGISTERED";
        break;
      case "send":
        newStatus = "SENT";
        break;
      case "receive":
        newStatus = "RECEIVED";
        break;
      case "complete":
        newStatus = "COMPLETED";
        break;
      case "archive":
        newStatus = "ARCHIVED";
        break;
      case "return_to_draft":
        newStatus = "DRAFT";
        break;
      default:
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    // Проверяем возможность перехода
    const allowedTransitions = STATUS_ACTIONS[currentStatus]
      ?.map((a) => mapActionToStatus(a))
      .filter(Boolean);
    if (!allowedTransitions?.includes(newStatus)) {
      return NextResponse.json(
        { error: `Нельзя перейти из статуса ${currentStatus} в ${newStatus}` },
        { status: 400 }
      );
    }

    if (action === "approve" || action === "reject") {
      const myApproval = document.approvals.find(
        (approval) => approval.userId === session.user!.id
      );

      if (document.approvals.length > 0 && (!myApproval || myApproval.status !== "PENDING")) {
        return NextResponse.json(
          { error: "Согласовать или отклонить может только назначенный согласующий" },
          { status: 403 }
        );
      }
    }

    // Начинаем транзакцию
    const result = await prisma.$transaction(async (tx) => {
      // Создаём запись в истории
      await tx.documentStatusHistory.create({
        data: {
          documentId,
          status: newStatus as any,
          previousStatus: currentStatus as any,
          changedById: session.user!.id,
          comment,
        },
      });

      // Обновляем документ
      const updateData: any = {
        status: newStatus,
      };

      // Дополнительные обновления в зависимости от действия
      if (action === "approve") {
        updateData.approvedById = session.user!.id;
        updateData.approvedAt = new Date();
      }

      if (action === "sign") {
        updateData.signedById = session.user!.id;
        updateData.signedAt = new Date();
      }

      if (action === "register") {
        // Генерируем регистрационный номер
        const regNumber = await generateRegNumber(tx, organizationId!, document.category as any);
        updateData.regNumber = regNumber;
        updateData.regDate = new Date();
      }

      if (action === "reject") {
        updateData.rejectionReason = comment;
      }

      if (assignToUserId) {
        updateData.assignedToId = assignToUserId;
        updateData.assignedAt = new Date();
      }

      // Обновляем документ
      const updatedDocument = await tx.document.update({
        where: { id: documentId },
        data: updateData,
      });

      // Если указаны согласующие, создаём цепочку согласований
      if (approvers && approvers.length > 0 && action === "submit_for_approval") {
        // Удаляем старые согласования
        await tx.documentApproval.deleteMany({
          where: { documentId },
        });

        // Создаём новые
        await tx.documentApproval.createMany({
          data: approvers.map((userId, index) => ({
            documentId,
            userId,
            order: index + 1,
            status: "PENDING",
          })),
        });
      }

      // Обновляем согласование текущего пользователя (если он в цепочке)
      if (action === "approve" || action === "reject") {
        await tx.documentApproval.updateMany({
          where: {
            documentId,
            userId: session.user!.id,
            status: "PENDING",
          },
          data: {
            status: action === "approve" ? "APPROVED" : "REJECTED",
            comment,
            approvedAt: new Date(),
          },
        });
      }

      return updatedDocument;
    });

    return NextResponse.json({
      success: true,
      document: {
        id: result.id,
        status: result.status,
        regNumber: result.regNumber,
        regDate: result.regDate,
      },
      message: getActionMessage(action),
    });
  } catch (error: any) {
    console.error("[ppo-head/documents/workflow] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при изменении статуса",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ppo-head/documents/[id]/workflow
 * Получить историю статусов документа
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: documentId } = await params;

    const permView = await checkUserPermissions(session.user.id, "documents_view");
    if (!permView.hasAccess || !permView.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const organizationId = permView.organizationId;
    const normalizedPermissions = normalizeStaffPermissions(permView.permissions);

    // Получаем документ с историей
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        statusHistory: {
          include: {
            changedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { changedAt: "desc" },
        },
        approvals: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!document || document.organizationId !== organizationId) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Определяем доступные действия
    const availableActions = getAllowedActionsForStatus(document.status, normalizedPermissions);

    return NextResponse.json({
      currentStatus: document.status,
      availableActions,
      statusHistory: document.statusHistory,
      approvals: document.approvals,
    });
  } catch (error: any) {
    console.error("[ppo-head/documents/workflow] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении истории" },
      { status: 500 }
    );
  }
}

// Генерация регистрационного номера
async function generateRegNumber(
  tx: any,
  organizationId: string,
  category: "INCOMING" | "OUTGOING" | "INTERNAL" | "DRAFT"
): Promise<string> {
  const year = new Date().getFullYear();
  
  // Получаем или создаём запись реестра
  let registry = await tx.documentRegistry.findUnique({
    where: {
      organizationId_year_category: {
        organizationId,
        year,
        category,
      },
    },
  });

  if (!registry) {
    registry = await tx.documentRegistry.create({
      data: {
        organizationId,
        year,
        category,
        lastNumber: 0,
        prefix: category === "INCOMING" ? "ВХ" : 
                category === "OUTGOING" ? "ИСХ" : 
                category === "INTERNAL" ? "ВН" : "",
      },
    });
  }

  // Увеличиваем номер
  const newNumber = registry.lastNumber + 1;
  await tx.documentRegistry.update({
    where: { id: registry.id },
    data: { lastNumber: newNumber },
  });

  // Формируем номер
  const prefix = registry.prefix || "";
  const formattedNumber = newNumber.toString().padStart(4, "0");
  
  return prefix ? `${prefix}-${formattedNumber}/${year}` : `${formattedNumber}/${year}`;
}

function mapActionToStatus(action: WorkflowAction): string {
  switch (action) {
    case "submit_for_review":
      return "PENDING_REVIEW";
    case "submit_for_approval":
      return "PENDING_APPROVAL";
    case "approve":
      return "PENDING_SIGNATURE";
    case "reject":
      return "REJECTED";
    case "submit_for_signature":
      return "PENDING_SIGNATURE";
    case "sign":
      return "SIGNED";
    case "register":
      return "REGISTERED";
    case "send":
      return "SENT";
    case "receive":
      return "RECEIVED";
    case "complete":
      return "COMPLETED";
    case "archive":
      return "ARCHIVED";
    case "return_to_draft":
      return "DRAFT";
    default:
      return "DRAFT";
  }
}

// Сообщение о действии
function getActionMessage(action: WorkflowAction): string {
  const messages: Record<WorkflowAction, string> = {
    submit_for_review: "Документ отправлен на рассмотрение",
    submit_for_approval: "Документ отправлен на согласование",
    approve: "Документ согласован",
    reject: "Документ отклонён",
    submit_for_signature: "Документ отправлен на подпись",
    sign: "Документ подписан",
    register: "Документ зарегистрирован",
    send: "Документ отправлен",
    receive: "Документ принят",
    complete: "Документ исполнен",
    archive: "Документ отправлен в архив",
    return_to_draft: "Документ возвращён в черновик",
  };
  return messages[action];
}
