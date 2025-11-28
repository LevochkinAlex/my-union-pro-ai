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

    // Если сессия пустая, создаём приветственное сообщение
    // (на случай если сессия была создана, но welcome message не был добавлен)
    if (messages.length === 0) {
      console.log("[GET /api/chat/session/[id]] Session is empty, creating welcome message");
      
      // Определяем содержание приветствия в зависимости от типа сессии
      let welcomeMessageContent = "";

      if (chatSession.type === "STATEMENT") {
        welcomeMessageContent = `Здравствуйте! 👋 Я AI-помощник профсоюза МООП РЗ.

Я готов ответить на ваши вопросы о профсоюзе, скидках BestBenefits, правах членов профсоюза и многом другом.

Если вы ещё не член профсоюза - заполните анкету для подачи заявления о вступлении.

[SHOW_SELF_FILL_BUTTON]`;
      } else if (chatSession.type === "APPEAL") {
        welcomeMessageContent = "Здравствуйте! Я ваш помощник по обращениям в профсоюз. Опишите вашу ситуацию или задайте вопрос, и я постараюсь помочь.";
      } else {
        welcomeMessageContent = "Здравствуйте! Чем могу помочь?";
      }

      const welcomeMessage = await prisma.chatMessage.create({
        data: {
          content: welcomeMessageContent,
          role: "assistant",
          userId: session.user.id,
          sessionId: chatSession.id,
          chatBotId: null,
        },
      });

      messages = [welcomeMessage];
      console.log("[GET /api/chat/session/[id]] Welcome message created");
    }

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

