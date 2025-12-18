import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateChatCache } from "@/lib/cache-invalidation";

// POST /api/chat/[chatId]/read - пометить все сообщения в чате как прочитанные
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
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Обновляем время прочтения синхронно
    const now = new Date();
    await prisma.chat.update({
      where: { id: chatId },
      data: chat.participant1Id === userId
        ? { participant1ReadAt: now }
        : { participant2ReadAt: now },
    });

    // Инвалидируем кеш чатов
    await invalidateChatCache(userId);

    return NextResponse.json({ success: true, readAt: now });
  } catch (error) {
    console.error("[chat/read] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при пометке сообщений как прочитанных" },
      { status: 500 }
    );
  }
}
