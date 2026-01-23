import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { DocumentStatus } from "@prisma/client";

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

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: meetingId, documentId } = await params;
    const body = await request.json();
    const { comment } = body;

    // Проверяем заседание
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

    if (meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    // Проверяем, что пользователь является председателем
    const isChairman = meeting.participants.some(
      p => p.user?.id === session.user.id && p.role === "CHAIRMAN"
    );

    if (!isChairman) {
      return NextResponse.json(
        { error: "Только председатель может утвердить документ" },
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
