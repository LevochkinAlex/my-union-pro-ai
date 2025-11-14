import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Получить список сессий чата
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    console.log("[sessions-api] Fetching sessions for user:", session.user.id);

    // Получаем все сессии пользователя
    const chatSessions = await prisma.chatSession.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log("[sessions-api] Found sessions:", chatSessions.length);

    // Форматируем результат
    const formattedSessions = chatSessions.map((chatSession) => {
      return {
        id: chatSession.id,
        title: chatSession.title,
        type: chatSession.type,
        createdAt: chatSession.createdAt,
        messageCount: chatSession._count.messages,
      };
    });

    console.log("[sessions-api] Returning", formattedSessions.length, "formatted sessions");

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

// Создать новую сессию чата
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const type = body.type || "APPEAL"; // APPEAL для обращения, STATEMENT для заявления
    const title = body.title;

    // Генерируем название для обращения
    let sessionTitle = title;
    if (!sessionTitle && type === "APPEAL") {
      // Генерируем номер обращения на основе timestamp
      const appealNumber = Date.now().toString().slice(-8);
      sessionTitle = `Обращение №${appealNumber}`;
    } else if (!sessionTitle) {
      sessionTitle = "Заявление";
    }

    // Создаем новую сессию
    const chatSession = await prisma.chatSession.create({
      data: {
        userId: session.user.id,
        title: sessionTitle,
        type: type === "APPEAL" ? "APPEAL" : "STATEMENT",
      },
    });

    return NextResponse.json({
      session: {
        id: chatSession.id,
        title: chatSession.title,
        type: chatSession.type,
        createdAt: chatSession.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating chat session:", error);
    return NextResponse.json(
      { error: "Ошибка при создании сессии чата" },
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

