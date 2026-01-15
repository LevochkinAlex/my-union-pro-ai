import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";
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

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: meetingId, participantId } = await params;
    const body = await request.json();
    const { attendance } = body;

    if (!attendance || !Object.values(MeetingAttendanceStatus).includes(attendance)) {
      return NextResponse.json(
        { error: "Некорректный статус присутствия" },
        { status: 400 }
      );
    }

    // Проверяем, что заседание принадлежит организации председателя
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { organizationId: true },
    });

    if (!meeting || meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    // Обновляем статус присутствия
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
    return NextResponse.json(
      {
        error: "Ошибка при обновлении статуса участника",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
