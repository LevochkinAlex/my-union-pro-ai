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
      // Выбираем бота в зависимости от типа сессии
      let bot = null;
      if (chatSession.type === "APPEAL") {
        // Для обращений используем Appeal Bot
        bot = await prisma.chatBot.findFirst({
          where: {
            isActive: true,
            name: "Appeal Bot",
          },
        });
        // Если Appeal Bot не найден, используем default bot как fallback
        if (!bot) {
          bot = await prisma.chatBot.findFirst({
            where: {
              isActive: true,
              isDefault: true,
            },
          });
        }
      } else {
        // Для заявлений используем default bot
        bot = await prisma.chatBot.findFirst({
          where: {
            isActive: true,
            isDefault: true,
          },
        });
      }

      let welcomeMessageContent: string;
      if (chatSession.type === "APPEAL") {
        // Приветствие для обращений
        welcomeMessageContent = "Здравствуйте! Я ваш помощник по обращениям в профсоюз. Я могу помочь вам с вопросами и проблемами, связанными с профсоюзом, трудовыми отношениями и правами работников. При ответах я опираюсь на законы Российской Федерации, устав и положения профсоюза. Опишите, пожалуйста, ваше обращение или вопрос, и я постараюсь вам помочь.";
      } else {
        // Приветствие для заявлений - проверяем есть ли документы
        const hasDocuments = await prisma.document.findFirst({
          where: {
            userId: session.user.id,
            type: {
              in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
            },
            status: {
              not: "DRAFT",
            },
          },
        });

        if (hasDocuments) {
          // Документы уже есть - приветствие для сбора дополнительной информации
          welcomeMessageContent = "Здравствуйте! Ваше заявление уже сгенерировано и находится в обработке. Чтобы я мог лучше помогать вам, расскажите, пожалуйста, немного о себе. Чем вы занимаетесь?";
        } else {
          // Документов нет - обычное приветствие для сбора профиля
          welcomeMessageContent = "Здравствуйте! Я ваш помощник для вступления в Профсоюз работников здравоохранения РФ. Я помогу вам заполнить профиль и подготовить необходимые документы для этого. Давайте начнем. Укажите регион России, в которой вы находитесь.";
        }
      }

      const welcomeMessage = await prisma.chatMessage.create({
        data: {
          content: welcomeMessageContent,
          role: "assistant",
          userId: session.user.id,
          sessionId: chatSession.id,
          chatBotId: bot?.id || null,
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

