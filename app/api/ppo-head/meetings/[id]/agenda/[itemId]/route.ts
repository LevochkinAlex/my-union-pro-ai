import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead } from "@/lib/ppo-head-utils";

/**
 * DELETE /api/ppo-head/meetings/[id]/agenda/[itemId]
 * Удаление пункта повестки
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
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

    const { id: meetingId, itemId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
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

    const item = await prisma.meetingAgendaItem.findFirst({
      where: { id: itemId, meetingId },
    });

    if (!item) {
      return NextResponse.json({ error: "Пункт повестки не найден" }, { status: 404 });
    }

    await prisma.meetingAgendaItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ppo-head/meetings/[id]/agenda/[itemId]] DELETE error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при удалении пункта повестки",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
