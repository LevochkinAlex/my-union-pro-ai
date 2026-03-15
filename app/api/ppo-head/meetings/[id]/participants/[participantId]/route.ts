import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { MeetingAttendanceStatus } from "@prisma/client";

/**
 * PATCH /api/ppo-head/meetings/[id]/participants/[participantId]
 * Обновление статуса присутствия участника заседания
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id: meetingId, participantId } = await params;
    if (!participantId) {
      return NextResponse.json({ error: "Не указан участник" }, { status: 400 });
    }
    let body: { attendance?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
    }
    const { attendance } = body;

    if (!attendance || !Object.values(MeetingAttendanceStatus).includes(attendance)) {
      return NextResponse.json(
        { error: "Некорректный статус присутствия" },
        { status: 400 }
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { organizationId: true },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    const permEdit = await checkUserPermissions(session.user.id, "documents_edit");
    const permView = await checkUserPermissions(session.user.id, "documents_view");
    const canEditByEdit = permEdit.hasAccess && permEdit.organizationId && meeting.organizationId === permEdit.organizationId;
    const canEditByView = permView.hasAccess && permView.organizationId && meeting.organizationId === permView.organizationId;
    const myParticipation = await prisma.meetingParticipant.findFirst({
      where: { meetingId, userId: session.user.id },
      select: { role: true },
    });
    const canEditByRole = !!myParticipation && ["CHAIRMAN", "SECRETARY"].includes(myParticipation.role);
    if (!canEditByEdit && !canEditByView && !canEditByRole) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const existing = await prisma.meetingParticipant.findFirst({
      where: { id: participantId, meetingId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
    }

    const participant = await prisma.meetingParticipant.update({
      where: { id: participantId },
      data: { attendance: attendance as MeetingAttendanceStatus },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, middleName: true },
        },
      },
    });

    return NextResponse.json({ participant });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/participants/[participantId]] PATCH error:", error);
    if (error?.code === "P2025") {
      return NextResponse.json(
        { error: "Участник не найден" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        error: "Ошибка при обновлении статуса участника",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
