/**
 * GET /api/ppo-head/meetings/[id]/extracts/[documentId]
 * Список userId, которым уже разослана эта выписка (копии во Входящих).
 *
 * DELETE /api/ppo-head/meetings/[id]/extracts/[documentId]
 * Удаление выписки заседания. Доступно председателю и заместителю.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: meetingId, documentId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, organizationId: true },
    });
    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }
    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    const copies = await prisma.document.findMany({
      where: {
        type: "PROTOCOL_EXTRACT",
        metadata: { path: ["originalDocumentId"], equals: documentId },
        assignedToId: { not: null },
      },
      select: { assignedToId: true },
    });
    const userIds = copies.map((d) => d.assignedToId).filter((id): id is string => id != null);

    return NextResponse.json({ userIds });
  } catch (error) {
    console.error("[extracts/[documentId]] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении списка получателей" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const canDeleteMeeting =
      perm.isChairman || (!!perm.roleName && /зам|заместитель/i.test(perm.roleName ?? ""));
    if (!canDeleteMeeting) {
      return NextResponse.json(
        { error: "Удалять выписки могут только председатель и заместитель председателя" },
        { status: 403 }
      );
    }

    const { id: meetingId, documentId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, organizationId: true },
    });
    if (!meeting) {
      return NextResponse.json({ error: "Заседание не найдено" }, { status: 404 });
    }
    if (meeting.organizationId !== perm.organizationId) {
      return NextResponse.json({ error: "Нет доступа к этому заседанию" }, { status: 403 });
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, meetingExtractId: true, type: true },
    });
    if (!document) {
      return NextResponse.json({ error: "Выписка не найдена" }, { status: 404 });
    }
    if (document.meetingExtractId !== meetingId) {
      return NextResponse.json(
        { error: "Выписка не относится к этому заседанию" },
        { status: 400 }
      );
    }

    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({
      success: true,
      message: "Выписка удалена",
    });
  } catch (error) {
    console.error("[extracts/delete] DELETE error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при удалении выписки",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
