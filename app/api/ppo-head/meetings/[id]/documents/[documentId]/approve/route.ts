import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentStatus } from "@prisma/client";
import { postMeetingChatSystemMessage } from "@/lib/meeting-chat";

/**
 * POST /api/ppo-head/meetings/[id]/documents/[documentId]/approve
 * Согласование документа участником заседания
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

    const { id: meetingId, documentId } = await params;
    const body = await request.json().catch(() => ({}));
    const { action = "approve", comment } = body as { action?: "approve" | "reject"; comment?: string };
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Некорректное действие согласования" }, { status: 400 });
    }

    // Проверяем документ и согласование
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        approvals: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true },
            },
          },
        },
        meetingAsAgenda: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true },
                },
              },
            },
          },
        },
        meetingAsProtocol: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Проверяем статус документа
    if (document.status !== DocumentStatus.PENDING_APPROVAL) {
      return NextResponse.json(
        { error: "Документ должен быть на согласовании" },
        { status: 400 }
      );
    }

    // Определяем заседание
    const meeting = document.meetingAsAgenda || document.meetingAsProtocol;
    if (!meeting || meeting.id !== meetingId) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    const myParticipation = meeting.participants.find(p => p.user?.id === session.user.id);
    const isChairman = myParticipation?.role === "CHAIRMAN";
    const isParticipant = myParticipation != null && !isChairman;

    if (!isParticipant) {
      return NextResponse.json(
        {
          error: isChairman
            ? "Председатель утверждает документ на странице заседания (кнопка «Утвердить повестку» / «Утвердить протокол»)"
            : "Вы не являетесь участником этого заседания",
        },
        { status: 403 }
      );
    }

    // Участник заседания (не председатель) может согласовывать документ этого заседания без отдельного права.
    // Право documents_approve нужно для общего журнала документов; здесь достаточно участия в заседании.

    const newStatus = action === "reject" ? "REJECTED" : "APPROVED";
    const approval = document.approvals.find(a => a.userId === session.user.id);

    if (approval) {
      if (approval.status !== "PENDING") {
        return NextResponse.json(
          {
            error:
              approval.status === "APPROVED"
                ? "Документ уже согласован вами"
                : "Документ уже отклонён вами",
          },
          { status: 400 }
        );
      }
      await prisma.documentApproval.update({
        where: { id: approval.id },
        data: {
          status: newStatus,
          comment: comment || null,
          approvedAt: new Date(),
        },
      });
    } else {
      return NextResponse.json(
        { error: "Вы не назначены согласующим по этому документу" },
        { status: 403 }
      );
    }

    const allApprovals = await prisma.documentApproval.findMany({
      where: { documentId: document.id },
    });

    const allApproved = allApprovals.every(a => a.status === "APPROVED");
    const hasRejected = allApprovals.some(a => a.status === "REJECTED");
    const pendingCount = allApprovals.filter(a => a.status === "PENDING").length;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true, middleName: true },
    });
    const displayName = [user?.lastName, user?.firstName, user?.middleName].filter(Boolean).join(" ") || "Участник";
    const docLabel = document.meetingAsAgenda ? "Повестку" : "Протокол";
    const message =
      action === "reject"
        ? `${displayName} отклонил ${docLabel}${comment ? `: ${comment}` : "."}`
        : `${displayName} согласовал ${docLabel}${comment ? ` (примечание: ${comment})` : "."}`;
    postMeetingChatSystemMessage(meetingId, message, session.user.id).catch((err) =>
      console.warn("[approve] postMeetingChatSystemMessage:", err)
    );

    return NextResponse.json({
      message: action === "reject" ? "Документ отклонён" : "Документ согласован",
      action: newStatus,
      allApproved,
      hasRejected,
      pendingCount,
      totalApprovals: allApprovals.length,
      approvedCount: allApprovals.filter(a => a.status === "APPROVED").length,
    });
  } catch (error: any) {
    console.error("[approve] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при согласовании документа",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
