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
        participants: {
          where: { userId, leftAt: null },
          select: { id: true, userId: true },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    // Для GROUP чатов проверяем через таблицу participants
    // Для PRIVATE чатов - через participant1Id/participant2Id
    const isParticipant = chat.type === "GROUP"
      ? chat.participants.length > 0
      : (chat.participant1Id === userId || chat.participant2Id === userId);

    if (!isParticipant) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Обновляем время последней активности (отметка, что чат открыт)
    const now = new Date();
    
    if (chat.type === "GROUP") {
      // Для GROUP чатов обновляем readAt в таблице participants
      if (chat.participants[0]) {
        await prisma.chatParticipant.update({
          where: { id: chat.participants[0].id },
          data: { readAt: now },
        });
      }
    } else {
      // Для PRIVATE чатов используем поля participant1ReadAt/participant2ReadAt
      await prisma.chat.update({
        where: { id: chatId },
        data: chat.participant1Id === userId
          ? { participant1ReadAt: now }
          : { participant2ReadAt: now },
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

