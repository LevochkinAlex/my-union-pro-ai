import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { MeetingStatus, DocumentStatus } from "@prisma/client";

// Допустимые переходы статусов заседания
const STATUS_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED", "DRAFT"],
  IN_PROGRESS: ["VOTING", "COMPLETED"],
  VOTING: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: ["DRAFT"],
};

// Действия для изменения статуса
type StatusAction = 
  | "schedule"     // Запланировать
  | "start"        // Начать заседание
  | "start_voting" // Начать голосование
  | "complete"     // Завершить
  | "cancel"       // Отменить
  | "reopen";      // Вернуть в черновик

const ACTION_TO_STATUS: Record<StatusAction, MeetingStatus> = {
  schedule: "SCHEDULED",
  start: "IN_PROGRESS",
  start_voting: "VOTING",
  complete: "COMPLETED",
  cancel: "CANCELLED",
  reopen: "DRAFT",
};

/**
 * POST /api/ppo-head/meetings/[id]/status
 * Изменение статуса заседания
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

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body as { action: StatusAction };

    if (!action || !ACTION_TO_STATUS[action]) {
      return NextResponse.json(
        { error: "Укажите действие: schedule, start, start_voting, complete, cancel, reopen" },
        { status: 400 }
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        agendaDocument: true,
        protocolDocument: true,
        agendaItems: true,
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    const currentStatus = meeting.status;
    const newStatus = ACTION_TO_STATUS[action];

    // Проверка допустимости перехода
    const allowedStatuses = STATUS_TRANSITIONS[currentStatus];
    if (!allowedStatuses.includes(newStatus)) {
      return NextResponse.json(
        { 
          error: `Невозможно изменить статус с "${currentStatus}" на "${newStatus}"`,
          allowedStatuses,
        },
        { status: 400 }
      );
    }

    // Дополнительные проверки в зависимости от действия
    if (action === "schedule" && meeting.agendaItems.length === 0) {
      return NextResponse.json(
        { error: "Добавьте хотя бы один вопрос в повестку перед планированием" },
        { status: 400 }
      );
    }

    if (action === "complete" && !meeting.protocolDocument) {
      return NextResponse.json(
        { error: "Перед завершением заседания необходимо сформировать протокол" },
        { status: 400 }
      );
    }

    const updateData: any = {
      status: newStatus,
    };

    // Фиксация времени начала/окончания
    if (action === "start") {
      updateData.actualStartAt = new Date();
    }
    if (action === "complete") {
      updateData.actualEndAt = new Date();
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id },
      data: updateData,
      include: {
        agendaDocument: {
          select: { id: true, regNumber: true, status: true },
        },
        protocolDocument: {
          select: { id: true, regNumber: true, status: true },
        },
      },
    });

    // Если заседание завершено, обновим статус протокола на COMPLETED
    if (action === "complete" && meeting.protocolDocument) {
      await prisma.document.update({
        where: { id: meeting.protocolDocument.id },
        data: {
          status: DocumentStatus.COMPLETED,
          statusHistory: {
            create: {
              status: DocumentStatus.COMPLETED,
              previousStatus: meeting.protocolDocument.status as DocumentStatus,
              changedById: session.user.id,
              comment: "Заседание завершено",
            },
          },
        },
      });
    }

    return NextResponse.json({
      meeting: updatedMeeting,
      message: getActionMessage(action),
    });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/status] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при изменении статуса",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

function getActionMessage(action: StatusAction): string {
  const messages: Record<StatusAction, string> = {
    schedule: "Заседание запланировано",
    start: "Заседание началось",
    start_voting: "Голосование начато",
    complete: "Заседание завершено",
    cancel: "Заседание отменено",
    reopen: "Заседание возвращено в черновик",
  };
  return messages[action];
}
