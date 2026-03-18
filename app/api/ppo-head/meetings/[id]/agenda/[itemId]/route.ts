import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { notifyParticipantsAboutAgendaChange } from "@/lib/notifications";

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

    const { id: meetingId, itemId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { organizationId: true, status: true },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_view");
    const canDeleteAgenda =
      perm.hasAccess &&
      perm.organizationId === meeting.organizationId &&
      (perm.isChairman || (!!perm.roleName && /зам|заместитель/i.test(perm.roleName)));

    if (!canDeleteAgenda) {
      return NextResponse.json({ error: "Удалять пункты повестки могут только председатель и заместитель председателя" }, { status: 403 });
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

    const meetingAfter = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { agendaDocumentId: true, agendaDocument: { select: { status: true } } },
    });
    if (meetingAfter?.agendaDocumentId && meetingAfter.agendaDocument?.status === "PENDING_APPROVAL") {
      await prisma.documentApproval.updateMany({
        where: { documentId: meetingAfter.agendaDocumentId },
        data: { status: "PENDING", comment: null, approvedAt: null },
      });
    }

    try {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { agendaModifiedAt: new Date() },
      });
    } catch (e) {
      console.warn("[ppo-head/meetings/[id]/agenda/[itemId]] DELETE: не удалось обновить agendaModifiedAt:", e);
    }

    await notifyParticipantsAboutAgendaChange(meetingId, "deleted").catch((err) =>
      console.warn("[ppo-head/meetings/[id]/agenda/[itemId]] notifyParticipantsAboutAgendaChange:", err)
    );

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
