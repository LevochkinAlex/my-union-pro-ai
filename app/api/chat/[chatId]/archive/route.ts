import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/chat/[chatId]/archive
 * Архивировать или разархивировать чат
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { chatId } = await params;
    const { archive } = await request.json(); // true to archive, false to unarchive

    // Проверяем, что чат существует и пользователь является участником
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: {
            userId: session.user.id,
            leftAt: null,
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    // Проверяем участие в чате
    const isParticipant = chat.participants.length > 0;

    if (!isParticipant) {
      return NextResponse.json(
        { error: "Вы не являетесь участником этого чата" },
        { status: 403 }
      );
    }

    // Обновляем статус архивации
    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data: {
        archivedAt: archive ? new Date() : null,
      },
    });

    // Журналируем действие для обращений (если это чат обращения)
    const ticket = await prisma.ticket.findFirst({
      where: { chatId: chatId },
      select: { id: true },
    });
    
    if (ticket) {
      await prisma.ticketActionLog.create({
        data: {
          ticketId: ticket.id,
          userId: session.user.id,
          actionType: archive ? "archived" : "unarchived",
          description: archive
            ? "Чат обращения перемещён в архив"
            : "Чат обращения восстановлен из архива",
        },
      });
    }

    return NextResponse.json({
      success: true,
      archived: !!updatedChat.archivedAt,
      message: archive ? "Чат архивирован" : "Чат разархивирован",
    });
  } catch (error: any) {
    console.error("[chat/archive] Error:", error);
    return NextResponse.json(
      { error: "Ошибка архивации", details: error.message },
      { status: 500 }
    );
  }
}
