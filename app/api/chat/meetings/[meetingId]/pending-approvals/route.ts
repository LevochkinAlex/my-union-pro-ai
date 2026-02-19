import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentStatus } from "@prisma/client";

/**
 * GET /api/chat/meetings/[meetingId]/pending-approvals
 * Список документов заседания, ожидающих согласования текущим пользователем.
 * Используется в чате заседания для блока «Согласовать» / «Открыть документ».
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { meetingId } = await params;
    if (!meetingId) {
      return NextResponse.json({ error: "meetingId обязателен" }, { status: 400 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        agendaDocumentId: true,
        protocolDocumentId: true,
        participants: {
          where: { userId: session.user.id },
          select: { id: true },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }

    const isParticipant = meeting.participants.length > 0;
    if (!isParticipant) {
      return NextResponse.json({ items: [] });
    }

    const documentIds: string[] = [];
    if (meeting.agendaDocumentId) documentIds.push(meeting.agendaDocumentId);
    if (meeting.protocolDocumentId) documentIds.push(meeting.protocolDocumentId);
    if (documentIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        status: DocumentStatus.PENDING_APPROVAL,
      },
      include: {
        approvals: {
          where: { userId: session.user.id, status: "PENDING" },
          select: { id: true },
        },
      },
    });

    const items = documents
      .filter((d) => d.approvals.length > 0)
      .map((d) => ({
        meetingId: meeting.id,
        documentId: d.id,
        title: d.title || (d.id === meeting.agendaDocumentId ? "Повестка дня" : "Протокол"),
        docLabel: d.id === meeting.agendaDocumentId ? "Повестка" : "Протокол",
      }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[chat/meetings/pending-approvals] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке списка документов на согласование" },
      { status: 500 }
    );
  }
}
