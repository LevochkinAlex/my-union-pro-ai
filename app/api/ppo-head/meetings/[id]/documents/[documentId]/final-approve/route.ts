import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentStatus, MeetingStatus } from "@prisma/client";
import { postMeetingChatSystemMessage, ensureMeetingGroupChat } from "@/lib/meeting-chat";
import { getOrCreateAIBotUser } from "@/lib/ai-assistant-bot";
import { clearAllMeetingNotifications, notifyParticipantsAboutProtocolApproval } from "@/lib/notifications";

/**
 * POST /api/ppo-head/meetings/[id]/documents/[documentId]/final-approve
 * Финальное утверждение документа председателем
 * Согласно алгоритму: после согласования всеми участниками, председатель утверждает документ
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
    let body: { comment?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Пустое тело запроса — допустимо
    }
    const { comment } = body;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true },
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

    const canApproveAgenda =
      perm.isChairman || (!!perm.roleName && /зам|заместитель/i.test(perm.roleName));

    if (!canApproveAgenda) {
      return NextResponse.json(
        { error: "Утвердить повестку могут только председатель или заместитель председателя" },
        { status: 403 }
      );
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

    if (document.status !== DocumentStatus.PENDING_APPROVAL) {
      return NextResponse.json(
        { error: "Документ должен быть на согласовании для утверждения" },
        { status: 400 }
      );
    }

    // Проверяем, что все участники согласовали документ
    const participantsWithUserId = meeting.participants.filter(
      p => p.user?.id && p.role !== "CHAIRMAN"
    );

    const allApproved = participantsWithUserId.every(participant => {
      const approval = document.approvals.find(a => a.userId === participant.user!.id);
      return approval && approval.status === "APPROVED";
    });

    if (!allApproved && participantsWithUserId.length > 0) {
      const pendingCount = participantsWithUserId.filter(participant => {
        const approval = document.approvals.find(a => a.userId === participant.user!.id);
        return !approval || approval.status !== "APPROVED";
      }).length;

      return NextResponse.json(
        {
          error: `Не все участники согласовали документ. Осталось: ${pendingCount}`,
          pendingCount,
        },
        { status: 400 }
      );
    }

    // Утверждаем документ (используем COMPLETED как статус "Утверждено")
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.COMPLETED, // COMPLETED = Утверждено
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
    });

    // Создаем запись в истории статусов
    await prisma.documentStatusHistory.create({
      data: {
        documentId: document.id,
        status: DocumentStatus.COMPLETED,
        previousStatus: DocumentStatus.PENDING_APPROVAL,
        changedById: session.user.id,
        comment: comment || "Документ утвержден председателем",
      },
    });

    const msg = document.meetingAsAgenda
      ? "Повестка дня утверждена председателем."
      : "Протокол утверждён председателем.";
    await postMeetingChatSystemMessage(meetingId, msg).catch((err) =>
      console.warn("[final-approve] postMeetingChatSystemMessage:", err)
    );

    // При утверждении протокола завершаем заседание: статус COMPLETED, архив чата, сообщение от ИИ
    if (document.meetingAsProtocol) {
      try {
        await ensureMeetingGroupChat(meetingId);

        const meetingWithChat = await prisma.meeting.findUnique({
          where: { id: meetingId },
          include: { groupChat: { select: { id: true } } },
        });

        if (meetingWithChat?.groupChat) {
          const chatId = meetingWithChat.groupChat.id;
          await prisma.chat.update({
            where: { id: chatId },
            data: { archivedAt: new Date() },
          });
          const botUser = await getOrCreateAIBotUser();
          const msg = await prisma.chatMessage.create({
            data: {
              chatId,
              senderId: botUser.id,
              content: "Чат закрыт. Переведен в архив.",
              messageType: "system",
            },
          });
          await prisma.chat.update({
            where: { id: chatId },
            data: { lastMessageId: msg.id, lastMessageAt: new Date() },
          });
          const participants = await prisma.chatParticipant.findMany({
            where: { chatId, leftAt: null },
            select: { userId: true },
          });
          const { invalidateUserChatsCache } = await import("@/lib/cache-invalidation");
          await Promise.allSettled(participants.map((p) => invalidateUserChatsCache(p.userId)));
        } else {
          console.warn("[final-approve] No groupChat for meeting", meetingId, "- archive/message skipped");
        }

        await prisma.meeting.update({
          where: { id: meetingId },
          data: { status: MeetingStatus.COMPLETED, actualEndAt: new Date() },
        });
        await clearAllMeetingNotifications(meetingId).catch((err) =>
          console.warn("[final-approve] clearAllMeetingNotifications:", err)
        );
        await notifyParticipantsAboutProtocolApproval(meetingId).catch((err) =>
          console.warn("[final-approve] notifyParticipantsAboutProtocolApproval:", err)
        );
      } catch (err) {
        console.warn("[final-approve] Error completing meeting / archiving chat:", err);
      }
    }

    return NextResponse.json({
      document: updatedDocument,
      message: "Документ успешно утвержден",
    });
  } catch (error: any) {
    console.error("[final-approve] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при утверждении документа",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
