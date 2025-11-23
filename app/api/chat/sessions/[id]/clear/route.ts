import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Очистить все сообщения из сессии (но оставить саму сессию)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id: sessionId } = await params;

    // Проверяем, что сессия существует и принадлежит пользователю
    const chatSession = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id,
      },
    });

    if (!chatSession) {
      return NextResponse.json(
        { error: "Сессия не найдена" },
        { status: 404 }
      );
    }

    // Удаляем все сообщения из сессии
    const result = await prisma.chatMessage.deleteMany({
      where: {
        sessionId: sessionId,
        userId: session.user.id,
      },
    });

    console.log(`[clear-session] Удалено ${result.count} сообщений из сессии ${sessionId}`);

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: "История сессии успешно очищена",
    });
  } catch (error) {
    console.error("Error clearing session messages:", error);
    return NextResponse.json(
      { error: "Ошибка при очистке истории сессии" },
      { status: 500 }
    );
  }
}

