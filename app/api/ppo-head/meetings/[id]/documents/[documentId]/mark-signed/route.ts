import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { DocumentStatus } from "@prisma/client";

/**
 * POST /api/ppo-head/meetings/[id]/documents/[documentId]/mark-signed
 * Отметить протокол как подписанный (статус SIGNED) после нажатия кнопки «Подписать».
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

    const isChairman = meeting.participants.some(
      (p) => p.user?.id === session.user.id && p.role === "CHAIRMAN"
    );

    if (!isChairman) {
      return NextResponse.json(
        { error: "Только председатель может отметить протокол как подписанный" },
        { status: 403 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        meetingAsProtocol: { select: { id: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    if (!document.meetingAsProtocol || document.meetingAsProtocol.id !== meetingId) {
      return NextResponse.json(
        { error: "Документ не является протоколом этого заседания" },
        { status: 400 }
      );
    }

    if (document.status !== DocumentStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Отметить как подписанный можно только утверждённый протокол" },
        { status: 400 }
      );
    }

    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.SIGNED,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      document: updatedDocument,
      message: "Протокол отмечен как подписанный",
    });
  } catch (error: unknown) {
    console.error("[mark-signed] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при отметке протокола",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
