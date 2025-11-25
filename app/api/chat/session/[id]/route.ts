import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Получить сообщения конкретной сессии
export async function GET(
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

    // Получаем сообщения этой сессии
    let messages = await prisma.chatMessage.findMany({
      where: {
        sessionId: sessionId,
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Если сессия пустая, НЕ создаём приветствие здесь
    // Приветствие создаётся ТОЛЬКО в /api/chat при создании новой сессии
    // Это предотвращает дублирование приветственных сообщений при race condition
    // Если messages.length === 0, просто возвращаем пустой массив
    // Фронтенд перенаправит на /api/chat для создания новой сессии с приветствием

    return NextResponse.json({
      session: {
        id: chatSession.id,
        title: chatSession.title,
        type: chatSession.type,
        createdAt: chatSession.createdAt,
      },
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching chat session:", error);
    return NextResponse.json(
      { error: "Ошибка при получении сессии чата" },
      { status: 500 }
    );
  }
}

