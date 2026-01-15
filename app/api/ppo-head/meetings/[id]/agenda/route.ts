import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/meetings/[id]/agenda
 * Получение пунктов повестки заседания
 */
export async function GET(
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

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { organizationId: true },
    });

    if (!meeting || meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    const agendaItems = await prisma.meetingAgendaItem.findMany({
      where: { meetingId: id },
      include: {
        speaker: {
          select: { id: true, firstName: true, lastName: true, middleName: true, jobTitle: true },
        },
        votes: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { orderNumber: "asc" },
    });

    return NextResponse.json({ agendaItems });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/agenda] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении повестки",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ppo-head/meetings/[id]/agenda
 * Добавление пункта повестки
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

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { organizationId: true, status: true },
    });

    if (!meeting || meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    if (meeting.status !== "DRAFT" && meeting.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: "Нельзя изменять повестку заседания в этом статусе" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, description, speakerId, speakerName, speakerPosition } = body;

    if (!title) {
      return NextResponse.json({ error: "Укажите название вопроса" }, { status: 400 });
    }

    // Получение следующего номера
    const lastItem = await prisma.meetingAgendaItem.findFirst({
      where: { meetingId: id },
      orderBy: { orderNumber: "desc" },
    });

    const orderNumber = (lastItem?.orderNumber || 0) + 1;

    const agendaItem = await prisma.meetingAgendaItem.create({
      data: {
        meetingId: id,
        orderNumber,
        title,
        description,
        speakerId,
        speakerName,
        speakerPosition,
      },
      include: {
        speaker: {
          select: { id: true, firstName: true, lastName: true, middleName: true },
        },
      },
    });

    return NextResponse.json({ agendaItem }, { status: 201 });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/agenda] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при добавлении пункта повестки",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ppo-head/meetings/[id]/agenda
 * Обновление пунктов повестки (массовое)
 */
export async function PATCH(
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

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { organizationId: true, status: true },
    });

    if (!meeting || meeting.organizationId !== orgHead.organizationId) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "Неверный формат данных" }, { status: 400 });
    }

    // Обновление каждого пункта
    const updatedItems = await Promise.all(
      items.map(async (item: any) => {
        if (!item.id) return null;

        const updateData: any = {};
        if (item.title !== undefined) updateData.title = item.title;
        if (item.description !== undefined) updateData.description = item.description;
        if (item.heardText !== undefined) updateData.heardText = item.heardText;
        if (item.speakerId !== undefined) updateData.speakerId = item.speakerId;
        if (item.speakerName !== undefined) updateData.speakerName = item.speakerName;
        if (item.speakerPosition !== undefined) updateData.speakerPosition = item.speakerPosition;
        if (item.resolutionText !== undefined) updateData.resolutionText = item.resolutionText;
        if (item.decidedText !== undefined) updateData.decidedText = item.decidedText;
        if (item.votesFor !== undefined) updateData.votesFor = item.votesFor;
        if (item.votesAgainst !== undefined) updateData.votesAgainst = item.votesAgainst;
        if (item.votesAbstained !== undefined) updateData.votesAbstained = item.votesAbstained;
        if (item.isApproved !== undefined) updateData.isApproved = item.isApproved;

        return prisma.meetingAgendaItem.update({
          where: { id: item.id },
          data: updateData,
        });
      })
    );

    return NextResponse.json({ items: updatedItems.filter(Boolean) });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/agenda] PATCH error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при обновлении повестки",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
