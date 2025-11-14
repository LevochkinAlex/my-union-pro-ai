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

    // Если сессия пустая, создаем приветственное сообщение в зависимости от типа
    if (messages.length === 0) {
      const defaultBot = await prisma.chatBot.findFirst({
        where: {
          isActive: true,
          isDefault: true,
        },
      });

      let welcomeMessageContent: string;
      if (chatSession.type === "APPEAL") {
        // Приветствие для обращений
        welcomeMessageContent = "Здравствуйте! Я ваш помощник по обращениям в профсоюз. Я могу помочь вам с вопросами по различным направлениям: бухгалтерия, юридические вопросы, технические вопросы и другие. Опишите, пожалуйста, ваше обращение или вопрос, и я постараюсь вам помочь.";
      } else {
        // Приветствие для заявлений
        welcomeMessageContent = "Здравствуйте! Я ваш помощник для вступления в Профсоюз работников здравоохранения РФ. Я помогу вам заполнить профиль и подготовить необходимые документы для этого. Давайте начнем. Укажите регион России, в которой вы находитесь.";
      }

      const welcomeMessage = await prisma.chatMessage.create({
        data: {
          content: welcomeMessageContent,
          role: "assistant",
          userId: session.user.id,
          sessionId: chatSession.id,
          chatBotId: defaultBot?.id || null,
        },
      });

      messages = [welcomeMessage];
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

