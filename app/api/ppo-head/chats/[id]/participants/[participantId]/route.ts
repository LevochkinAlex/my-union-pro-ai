import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * DELETE /api/ppo-head/chats/[id]/participants/[participantId]
 * Удалить участника из группы
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; participantId: string } | Promise<{ id: string; participantId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const chairman = await getPPOHead(session.user.id);
    if (!chairman) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id: chatId, participantId } = resolvedParams;

    // Проверяем, что чат существует и председатель его создатель
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true, createdById: true },
    });

    if (!chat || chat.type !== "GROUP") {
      return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
    }

    if (chat.createdById !== chairman.id) {
      return NextResponse.json({ error: "Только создатель может удалять участников" }, { status: 403 });
    }

    // Не даём удалить самого создателя
    if (participantId === chairman.id) {
      return NextResponse.json({ error: "Нельзя удалить создателя группы" }, { status: 400 });
    }

    // Удаляем участника
    await prisma.chatParticipant.deleteMany({
      where: {
        chatId,
        userId: participantId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ppo-head/chats/participants] DELETE error:", error);
    return NextResponse.json({ error: "Ошибка удаления участника" }, { status: 500 });
  }
}

/**
 * PUT /api/ppo-head/chats/[id]/participants/[participantId]
 * Обновить роль участника (назначить/снять админа)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; participantId: string } | Promise<{ id: string; participantId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const chairman = await getPPOHead(session.user.id);
    if (!chairman) {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id: chatId, participantId } = resolvedParams;

    const body = await request.json();
    const { role } = body; // "admin" или "member"

    // Проверяем, что чат существует и председатель его создатель
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true, createdById: true },
    });

    if (!chat || chat.type !== "GROUP") {
      return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
    }

    if (chat.createdById !== chairman.id) {
      return NextResponse.json({ error: "Только создатель может назначать админов" }, { status: 403 });
    }

    // Обновляем роль участника (роли: "admin", "member")
    await prisma.chatParticipant.updateMany({
      where: {
        chatId,
        userId: participantId,
      },
      data: {
        role: role === "admin" ? "admin" : "member",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ppo-head/chats/participants] PUT error:", error);
    return NextResponse.json({ error: "Ошибка обновления роли" }, { status: 500 });
  }
}

