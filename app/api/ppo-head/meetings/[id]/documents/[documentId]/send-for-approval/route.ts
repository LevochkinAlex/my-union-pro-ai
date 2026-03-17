import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentStatus } from "@prisma/client";
import { assignAgendaToParticipantsAndNotify } from "@/lib/meeting-agenda-notify";
import { ensureMeetingGroupChat, postMeetingChatSystemMessage } from "@/lib/meeting-chat";
import { sendMassNotification } from "@/lib/notifications";

/**
 * POST /api/ppo-head/meetings/[id]/documents/[documentId]/send-for-approval
 * Отправка документа на согласование участникам заседания
 * Согласно алгоритму: Шаг 3. Ознакомление/согласование повестки
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_approve");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: meetingId, documentId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true },
            },
          },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    // Проверяем документ и его связь с заседанием
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        approvals: true,
        meetingAsAgenda: {
          select: { id: true },
        },
        meetingAsProtocol: {
          select: { id: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Проверяем, что документ связан с этим заседанием
    const documentMeetingId = document.meetingAsAgenda?.id || document.meetingAsProtocol?.id;
    if (documentMeetingId !== meetingId) {
      return NextResponse.json(
        { error: "Документ не связан с этим заседанием" },
        { status: 400 }
      );
    }

    if (document.status !== DocumentStatus.DRAFT) {
      return NextResponse.json(
        { error: "Документ уже отправлен на согласование или утвержден" },
        { status: 400 }
      );
    }

    // Получаем участников заседания (кроме председателя)
    const participantsWithUserId = meeting.participants.filter(
      p => p.user?.id && p.role !== "CHAIRMAN"
    );

    if (participantsWithUserId.length === 0) {
      return NextResponse.json(
        {
          error: "Нет участников для согласования. Добавьте в заседание участников с привязанными учётными записями (раздел «Состав заседания» или «Присутствовали»), затем повторите рассылку.",
        },
        { status: 400 }
      );
    }

    // Создаем записи согласования для каждого участника, если их еще нет
    const existingApprovalUserIds = new Set(document.approvals.map(a => a.userId));
    
    await Promise.all(
      participantsWithUserId
        .filter(p => !existingApprovalUserIds.has(p.user!.id))
        .map((participant, index) => 
          prisma.documentApproval.create({
            data: {
              documentId: document.id,
              userId: participant.user!.id,
              order: document.approvals.length + index + 1,
              status: "PENDING",
            },
          })
        )
    );

    // Обновляем статус документа на "На согласовании"
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.PENDING_APPROVAL,
      },
      include: {
        approvals: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    // Создаем запись в истории статусов
    await prisma.documentStatusHistory.create({
      data: {
        documentId: document.id,
        status: DocumentStatus.PENDING_APPROVAL,
        previousStatus: DocumentStatus.DRAFT,
        changedById: session.user.id,
        comment: "Документ отправлен на согласование участникам заседания",
      },
    });

    const isAgenda = !!document.meetingAsAgenda;
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { lastName: true, firstName: true },
    });
    const chairmanName = [currentUser?.lastName, currentUser?.firstName].filter(Boolean).join(" ") || "Председатель";
    const docLabel = isAgenda ? "Повестка дня" : "Протокол";
    const inboxUrl = "/dashboard/documents?tab=incoming";

    if (isAgenda) {
      await assignAgendaToParticipantsAndNotify(meetingId, session.user.id, chairmanName);
    } else {
      // Протокол: не рассылаем во «Входящие» до подписания; рассылка только по кнопке «Разослать протокол во Входящие» (подписанный)
      const participantIds = participantsWithUserId.map((p) => p.user!.id);
      if (participantIds.length > 0) {
        const { clearAllMeetingNotifications } = await import("@/lib/notifications");
        await clearAllMeetingNotifications(meetingId).catch((err) =>
          console.warn("[send-for-approval] clearAllMeetingNotifications:", err)
        );
        await sendMassNotification({
          userIds: participantIds,
          title: `${docLabel} на согласование`,
          body: `Просьба согласовать протокол от ${chairmanName} на странице заседания.`,
          url: `/dashboard/documents/meetings/${meetingId}`,
          type: "meeting_document_approval",
          metadata: { meetingId, documentId },
        });
      }
    }

    const chatResult = await ensureMeetingGroupChat(meetingId);
    if (chatResult) {
      await postMeetingChatSystemMessage(
        meetingId,
        `${docLabel} отправлена на согласование участникам. Ознакомьтесь во вкладке «Входящие» и отметьте согласование или примечания.`
      );
    }

    return NextResponse.json({
      document: updatedDocument,
      message: `Документ отправлен на согласование ${participantsWithUserId.length} участникам. Участники получат документ во входящие, push и email`,
    });
  } catch (error: any) {
    console.error("[send-for-approval] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при отправке документа на согласование",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
