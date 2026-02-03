import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateUserChatsCache } from "@/lib/chat-redis";

/**
 * POST /api/chat/[chatId]/leave
 * Покинуть чат (удалить переписку из своего списка — как в Telegram).
 * Для личных чатов: чат исчезнет из списка. Для групп/каналов: выход из чата.
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

    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        leftAt: null,
      },
      include: {
        chat: { select: { type: true } },
      },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "Вы не являетесь участником этого чата" },
        { status: 403 }
      );
    }

    await prisma.chatParticipant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });

    await invalidateUserChatsCache(userId).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Чат удалён из списка",
    });
  } catch (error) {
    console.error("[chat/leave] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении чата из списка" },
      { status: 500 }
    );
  }
}
