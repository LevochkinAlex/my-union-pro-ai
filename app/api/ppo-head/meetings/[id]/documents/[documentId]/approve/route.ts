import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
import { DocumentStatus } from "@prisma/client";

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
    const body = await request.json();
    const { comment } = body;

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

    // Проверяем, что пользователь является участником заседания
    const isParticipant = meeting.participants.some(
      p => p.user?.id === session.user.id && p.role !== "CHAIRMAN"
    );

    if (!isParticipant) {
      return NextResponse.json(
        { error: "Вы не являетесь участником этого заседания" },
        { status: 403 }
      );
    }

    // Находим запись согласования для этого пользователя
    const approval = document.approvals.find(a => a.userId === session.user.id);

    if (!approval) {
      return NextResponse.json(
        { error: "Согласование не найдено" },
        { status: 404 }
      );
    }

    if (approval.status === "APPROVED") {
      return NextResponse.json(
        { error: "Документ уже согласован вами" },
        { status: 400 }
      );
    }

    // Обновляем статус согласования
    await prisma.documentApproval.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        comment: comment || null,
        approvedAt: new Date(),
      },
    });

    // Проверяем, все ли согласования получены
    const allApprovals = await prisma.documentApproval.findMany({
      where: { documentId: document.id },
    });

    const allApproved = allApprovals.every(a => a.status === "APPROVED");
    const pendingCount = allApprovals.filter(a => a.status === "PENDING").length;

    return NextResponse.json({
      message: "Документ согласован",
      allApproved,
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
