import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateChatCache, invalidateUserChatsCache } from "@/lib/chat-redis";

/**
 * POST /api/chat/[chatId]/delete
 * Полностью удалить чат (только для создателя группы/канала).
 * Разрешено только для GROUP/CHANNEL, созданных текущим пользователем, без привязанного обращения.
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
    const userId = session.user.id;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: { where: { leftAt: null }, select: { userId: true } },
        ticket: { select: { id: true } },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.type !== "GROUP" && chat.type !== "CHANNEL") {
      return NextResponse.json(
        { error: "Полное удаление доступно только для групп и каналов" },
        { status: 400 }
      );
    }

    if (chat.createdById !== userId) {
      return NextResponse.json(
        { error: "Удалить чат может только его создатель" },
        { status: 403 }
      );
    }

    if (chat.ticket) {
      return NextResponse.json(
        { error: "Нельзя удалить чат, связанный с обращением" },
        { status: 400 }
      );
    }

    const participantIds = chat.participants.map((p) => p.userId).filter(Boolean) as string[];

    await prisma.chat.delete({
      where: { id: chatId },
    });

    await invalidateChatCache(chatId).catch(() => {});
    await Promise.allSettled(
      participantIds.map((id) => invalidateUserChatsCache(id))
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Чат удалён",
    });
  } catch (error) {
    console.error("[chat/delete] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении чата" },
      { status: 500 }
    );
  }
}
