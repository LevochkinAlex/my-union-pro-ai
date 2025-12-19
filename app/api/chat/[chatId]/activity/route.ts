import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/chat/[chatId]/activity - Отметить чат как активный (heartbeat)
 * Вызывается периодически, когда пользователь просматривает чат
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        type: true,
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    // Проверяем доступ в зависимости от типа чата
    if (chat.type === "GROUP") {
      const isParticipant = await prisma.chatParticipant.findFirst({
        where: { chatId, userId, leftAt: null },
      });
      if (!isParticipant) {
        return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
      }
      // Для GROUP чата обновляем readAt в ChatParticipant
      await prisma.chatParticipant.updateMany({
        where: { chatId, userId, leftAt: null },
        data: { readAt: new Date() },
      });
    } else {
      // Для PRIVATE чата
      if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
        return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
      }
      // Обновляем время последней активности
      await prisma.chat.update({
        where: { id: chatId },
        data: chat.participant1Id === userId
          ? { participant1ReadAt: new Date() }
          : { participant2ReadAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[chat/activity] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении активности" },
      { status: 500 }
    );
  }
}

