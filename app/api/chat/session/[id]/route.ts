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

    // Проверяем, нужно ли создать или обновить приветственное сообщение
    if (chatSession.type === "STATEMENT") {
      // Проверяем это первый вход - проверяем отсутствие сообщений от пользователя (role: "user") в этой сессии
      const userMessagesCount = await prisma.chatMessage.count({
        where: {
          sessionId: chatSession.id,
          userId: session.user.id,
          role: "user", // Только сообщения от пользователя, не от бота
        },
      });
      
      const isFirstEntry = userMessagesCount === 0;
      
      // Ищем приветственное сообщение
      const welcomeMsg = messages.find(
        (msg) => msg.role === "assistant" && 
        msg.content.includes("Здравствуйте! 👋") && 
        !msg.isSystemMessage
      );
      
      if (isFirstEntry) {
        const welcomeMessageContent = `Здравствуйте! 👋 Я AI-помощник профсоюза МООП РЗ.

Подайте заявление о вступлении в профсоюз, заполнив анкету. Это займет не более 10 минут.

[SHOW_SELF_FILL_BUTTON]`;
        
        if (!welcomeMsg) {
          // Создаем приветственное сообщение с кнопкой
          const newWelcomeMessage = await prisma.chatMessage.create({
            data: {
              content: welcomeMessageContent,
              role: "assistant",
              userId: session.user.id,
              sessionId: chatSession.id,
              chatBotId: null,
            },
          });
          messages = [newWelcomeMessage, ...messages];
          console.log("[GET /api/chat/session/[id]] Welcome message with button created");
        } else if (!welcomeMsg.content.includes("[SHOW_SELF_FILL_BUTTON]")) {
          // Обновляем существующее сообщение, добавляя кнопку
          await prisma.chatMessage.update({
            where: { id: welcomeMsg.id },
            data: { content: welcomeMessageContent },
          });
          // Обновляем в массиве messages
          const index = messages.findIndex((m) => m.id === welcomeMsg.id);
          if (index !== -1) {
            messages[index] = { ...welcomeMsg, content: welcomeMessageContent };
          }
          console.log("[GET /api/chat/session/[id]] Welcome message updated with button");
        }
      } else if (messages.length === 0) {
        // Если не первый вход, но сессия пустая - создаем простое приветствие
        const welcomeMessageContent = `Здравствуйте! 👋 Я AI-помощник профсоюза МООП РЗ.

Я готов ответить на ваши вопросы о профсоюзе, скидках BestBenefits, правах членов профсоюза и многом другом.`;

        const newWelcomeMessage = await prisma.chatMessage.create({
          data: {
            content: welcomeMessageContent,
            role: "assistant",
            userId: session.user.id,
            sessionId: chatSession.id,
            chatBotId: null,
          },
        });
        messages = [newWelcomeMessage];
        console.log("[GET /api/chat/session/[id]] Welcome message created");
      }
    } else if (messages.length === 0) {
      // Для других типов сессий создаем приветствие, если сессия пустая
      let welcomeMessageContent = "";
      
      if (chatSession.type === "APPEAL") {
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
        isSystemMessage: msg.isSystemMessage || false,
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

