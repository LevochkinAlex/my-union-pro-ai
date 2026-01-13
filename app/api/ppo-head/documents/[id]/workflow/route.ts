import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { checkUserPermissions } from "@/lib/staff-permissions";

// Типы действий workflow
type WorkflowAction = 
  | "submit_for_review"      // Отправить на рассмотрение
  | "submit_for_approval"    // Отправить на согласование
  | "approve"                // Согласовать
  | "reject"                 // Отклонить
  | "submit_for_signature"   // Отправить на подпись
  | "sign"                   // Подписать
  | "register"               // Зарегистрировать
  | "send"                   // Отправить (для исходящих)
  | "receive"                // Принять (для входящих)
  | "complete"               // Исполнить
  | "archive"                // В архив
  | "return_to_draft";       // Вернуть в черновик

// Матрица переходов статусов
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["GENERATED", "PENDING_REVIEW", "PENDING_APPROVAL", "ARCHIVED"],
  GENERATED: ["PENDING_REVIEW", "PENDING_APPROVAL", "PENDING_SIGNATURE", "SIGNED", "ARCHIVED"],
  PENDING_REVIEW: ["PENDING_APPROVAL", "REJECTED", "DRAFT"],
  PENDING_APPROVAL: ["PENDING_SIGNATURE", "APPROVED", "REJECTED", "DRAFT"],
  PENDING_SIGNATURE: ["SIGNED", "REJECTED", "PENDING_APPROVAL"],
  SIGNED: ["REGISTERED"],
  REGISTERED: ["SENT", "COMPLETED", "ARCHIVED"],
  SENT: ["COMPLETED", "ARCHIVED"],
  RECEIVED: ["PENDING_REVIEW", "COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  REJECTED: ["DRAFT"],
  ARCHIVED: [],
};

// Права для действий
const ACTION_PERMISSIONS: Record<WorkflowAction, string[]> = {
  submit_for_review: ["documents_create", "documents_edit"],
  submit_for_approval: ["documents_create", "documents_edit"],
  approve: ["documents_approve"],
  reject: ["documents_approve"],
  submit_for_signature: ["documents_approve"],
  sign: ["documents_sign"],
  register: ["documents_create"],
  send: ["documents_create"],
  receive: ["documents_create"],
  complete: ["documents_edit"],
  archive: ["documents_edit"],
  return_to_draft: ["documents_edit"],
};

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

    // Проверяем доступ (председатель или сотрудник с правами)
    const chairman = await getPPOHead(session.user.id);
    let organizationId: string | null = null;
    let userPermissions: string[] = [];

    if (chairman) {
      organizationId = chairman.organizationId;
      // Председатель имеет все права
      userPermissions = [
        "documents_view", "documents_create", "documents_edit",
        "documents_approve", "documents_sign"
      ];
    } else {
      // Проверяем права сотрудника
      const permissions = await checkUserPermissions(session.user.id, "documents_view");
      if (!permissions.hasAccess) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      organizationId = permissions.organizationId;
      
      // Собираем все права сотрудника
      const staffPosition = await prisma.organizationStaff.findFirst({
        where: {
          userId: session.user.id,
          status: "ACTIVE",
        },
        include: { role: true },
      });
      
      if (staffPosition?.role?.permissions) {
        const perms = staffPosition.role.permissions as Record<string, boolean>;
        userPermissions = Object.entries(perms)
          .filter(([, value]) => value)
          .map(([key]) => key);
      }
    }

    if (!organizationId) {
      return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
    }

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

    // Проверяем права на действие
    const requiredPermissions = ACTION_PERMISSIONS[action];
    const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));
    
    if (!hasPermission) {
      return NextResponse.json(
        { error: `Нет прав для действия: ${action}` },
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
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions?.includes(newStatus)) {
      return NextResponse.json(
        { error: `Нельзя перейти из статуса ${currentStatus} в ${newStatus}` },
        { status: 400 }
      );
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: documentId } = await params;

    // Проверяем доступ
    const chairman = await getPPOHead(session.user.id);
    let organizationId: string | null = null;

    if (chairman) {
      organizationId = chairman.organizationId;
    } else {
      const permissions = await checkUserPermissions(session.user.id, "documents_view");
      if (!permissions.hasAccess) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      organizationId = permissions.organizationId;
    }

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
    const availableActions = getAvailableActions(document.status);

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

// Получить доступные действия для статуса
function getAvailableActions(status: string): WorkflowAction[] {
  switch (status) {
    case "DRAFT":
      return ["submit_for_review", "submit_for_approval", "archive"];
    case "GENERATED":
      return ["submit_for_review", "submit_for_approval", "submit_for_signature", "sign", "archive"];
    case "PENDING_REVIEW":
      return ["submit_for_approval", "reject", "return_to_draft"];
    case "PENDING_APPROVAL":
      return ["approve", "reject", "return_to_draft"];
    case "PENDING_SIGNATURE":
      return ["sign", "reject"];
    case "SIGNED":
      return ["register"];
    case "REGISTERED":
      return ["send", "complete", "archive"];
    case "SENT":
      return ["complete", "archive"];
    case "RECEIVED":
      return ["submit_for_review", "complete", "archive"];
    case "COMPLETED":
      return ["archive"];
    case "REJECTED":
      return ["return_to_draft"];
    default:
      return [];
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
