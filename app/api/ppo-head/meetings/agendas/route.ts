import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/meetings/agendas
 * Получение списка повесток для выбора при создании протокола
 * Возвращает заседания с утверждёнными повестками, но без протоколов
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const orgHead = await getOrgHead(session.user.id);

    if (!orgHead) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    // Получаем заседания с повесткой, но без протокола
    // Или заседания в статусах SCHEDULED, IN_PROGRESS, COMPLETED
    const meetings = await prisma.meeting.findMany({
      where: {
        organizationId: orgHead.organizationId,
        agendaDocumentId: { not: null },
        OR: [
          { protocolDocumentId: null },
          { status: "IN_PROGRESS" },
          { status: "COMPLETED" },
        ],
      },
      include: {
        agendaDocument: {
          select: {
            id: true,
            regNumber: true,
            status: true,
            title: true,
            createdAt: true,
          },
        },
        agendaItems: {
          select: {
            id: true,
            orderNumber: true,
            title: true,
            description: true,
            speakerName: true,
            speakerId: true,
            speaker: {
              select: { firstName: true, lastName: true, middleName: true },
            },
          },
          orderBy: { orderNumber: "asc" },
        },
        participants: {
          select: {
            id: true,
            role: true,
            attendance: true,
            canVote: true,
            userId: true,
            user: {
              select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true },
            },
            externalName: true,
            externalPosition: true,
          },
        },
      },
      orderBy: { scheduledDate: "desc" },
    });

    // Форматируем для удобства выбора
    const agendas = meetings.map((meeting) => ({
      meetingId: meeting.id,
      agendaDocumentId: meeting.agendaDocumentId,
      regNumber: meeting.agendaDocument?.regNumber || "",
      title: meeting.agendaDocument?.title || meeting.title || `Заседание ${meeting.number}`,
      status: meeting.agendaDocument?.status,
      meetingDate: meeting.scheduledDate,
      meetingTime: meeting.scheduledTime,
      meetingPlace: meeting.location,
      meetingNumber: meeting.number,
      meetingStatus: meeting.status,
      hasProtocol: !!meeting.protocolDocumentId,
      agendaItems: meeting.agendaItems,
      participants: meeting.participants,
    }));

    return NextResponse.json({ agendas });
  } catch (error: any) {
    console.error("[ppo-head/meetings/agendas] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении повесток",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
