import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/chat/[chatId]/participants/[userId] - удалить участника из чата
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string; userId: string }> | { chatId: string; userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId, userId } = resolvedParams;
    const currentUserId = session.user.id;

    // Проверяем, является ли текущий пользователь админом чата
    const currentParticipant = await prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId: currentUserId,
        leftAt: null,
      },
      include: {
        chat: {
          select: {
            type: true,
          },
        },
      },
    });

    if (!currentParticipant) {
      return NextResponse.json({ error: "Нет доступа к чату" }, { status: 403 });
    }

    // Проверяем, что это групповой чат или канал
    if (currentParticipant.chat.type !== 'GROUP' && currentParticipant.chat.type !== 'CHANNEL') {
      return NextResponse.json({ error: "Можно удалять участников только из групповых чатов и каналов" }, { status: 400 });
    }

    // Проверяем, что текущий пользователь - админ
    if (currentParticipant.role !== 'admin') {
      return NextResponse.json({ error: "Только админы могут удалять участников" }, { status: 403 });
    }

    // Нельзя удалить самого себя
    if (userId === currentUserId) {
      return NextResponse.json({ error: "Нельзя удалить самого себя" }, { status: 400 });
    }

    // Проверяем, существует ли участник
    const participantToRemove = await prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        leftAt: null,
      },
    });

    if (!participantToRemove) {
      return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
    }

    // Удаляем участника (помечаем как покинувшего)
    await prisma.chatParticipant.update({
      where: {
        id: participantToRemove.id,
      },
      data: {
        leftAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/chat/[chatId]/participants/[userId]] DELETE Error:", error);
    return NextResponse.json(
      { error: "Ошибка удаления участника" },
      { status: 500 }
    );
  }
}
