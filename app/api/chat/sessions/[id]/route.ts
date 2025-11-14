import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Удалить сессию чата
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

    // Нельзя удалить сессию заявления
    if (chatSession.type === "STATEMENT") {
      return NextResponse.json(
        { error: "Нельзя удалить чат заявления" },
        { status: 403 }
      );
    }

    // Удаляем сессию (сообщения удалятся каскадно)
    await prisma.chatSession.delete({
      where: {
        id: sessionId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Сессия удалена",
    });
  } catch (error) {
    console.error("Error deleting chat session:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении сессии" },
      { status: 500 }
    );
  }
}

