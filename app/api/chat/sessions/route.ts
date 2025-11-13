import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Получить список последних уникальных чатов (по группам сообщений)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Получаем сообщения пользователя, сгруппированные по временным интервалам
    // для определения отдельных сеансов чата
    const messages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100, // Последние 100 сообщений
    });

    // Группируем сообщения в сеансы (промежуток более 1 часа считается новым сеансом)
    const sessions: Array<{ messages: typeof messages; startTime: Date }> = [];
    let currentSession: typeof messages = [];
    let lastTime: Date | null = null;
    let sessionStartTime: Date | null = null;
    const ONE_HOUR = 60 * 60 * 1000;

    for (const message of messages) {
      if (!lastTime || new Date(message.createdAt).getTime() - new Date(lastTime).getTime() > ONE_HOUR) {
        if (currentSession.length > 0 && sessionStartTime) {
          sessions.push({ messages: currentSession, startTime: sessionStartTime });
        }
        currentSession = [message];
        sessionStartTime = message.createdAt;
      } else {
        currentSession.push(message);
      }
      lastTime = message.createdAt;
    }

    if (currentSession.length > 0 && sessionStartTime) {
      sessions.push({ messages: currentSession, startTime: sessionStartTime });
    }

    // Форматируем результат с заголовком каждого сеанса
    const formattedSessions = sessions.map((session) => {
      const firstUserMessage = session.messages
        .slice()
        .reverse()
        .find((msg) => msg.role === "user");
      const title = firstUserMessage?.content
        .substring(0, 50)
        .replace(/\n/g, " ") || "Новый чат";

      // Generate a stable session ID based on start time
      const sessionId = `session-${session.startTime.getTime()}`;

      return {
        id: sessionId,
        title,
        createdAt: session.startTime,
        messageCount: session.messages.length,
      };
    });

    return NextResponse.json({
      sessions: formattedSessions,
    });
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    return NextResponse.json(
      { error: "Ошибка при получении сеансов чата" },
      { status: 500 }
    );
  }
}

// Удалить весь чат (все сообщения пользователя)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const result = await prisma.chatMessage.deleteMany({
      where: {
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: "История чата успешно удалена",
    });
  } catch (error) {
    console.error("Error clearing chat history:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении истории чата" },
      { status: 500 }
    );
  }
}

