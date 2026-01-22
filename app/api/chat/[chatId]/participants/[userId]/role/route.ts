import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/chat/[chatId]/participants/[userId]/role - изменить роль участника
export async function PATCH(
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
    const { role } = await request.json();

    if (!role || (role !== 'admin' && role !== 'member')) {
      return NextResponse.json({ error: "Некорректная роль" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "Можно изменять роли только в групповых чатах и каналах" }, { status: 400 });
    }

    // Проверяем, что текущий пользователь - админ
    if (currentParticipant.role !== 'admin') {
      return NextResponse.json({ error: "Только админы могут изменять роли" }, { status: 403 });
    }

    // Проверяем, существует ли участник
    const participantToUpdate = await prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        leftAt: null,
      },
    });

    if (!participantToUpdate) {
      return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
    }

    // Обновляем роль
    await prisma.chatParticipant.update({
      where: {
        id: participantToUpdate.id,
      },
      data: {
        role,
      },
    });

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error("[api/chat/[chatId]/participants/[userId]/role] PATCH Error:", error);
    return NextResponse.json(
      { error: "Ошибка изменения роли" },
      { status: 500 }
    );
  }
}
