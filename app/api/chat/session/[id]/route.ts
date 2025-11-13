import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Get messages for a specific chat session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const sessionId = params.id;

    // Get all messages for this session starting from the given message ID
    // Group by 1-hour intervals to find the session boundary
    const allMessages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Find the starting message for this session
    const startingMessageIndex = allMessages.findIndex(
      (msg) => msg.id === sessionId
    );

    if (startingMessageIndex === -1) {
      return NextResponse.json(
        { error: "Сеанс чата не найден" },
        { status: 404 }
      );
    }

    // Find all messages in this session (until next 1-hour gap)
    const ONE_HOUR = 60 * 60 * 1000;
    const sessionMessages: typeof allMessages = [];
    const startTime = new Date(
      allMessages[startingMessageIndex].createdAt
    ).getTime();

    for (let i = startingMessageIndex; i < allMessages.length; i++) {
      const messageTime = new Date(allMessages[i].createdAt).getTime();

      // Stop if we've hit the next session boundary
      if (i > startingMessageIndex && messageTime - startTime > ONE_HOUR) {
        break;
      }

      sessionMessages.push(allMessages[i]);
    }

    return NextResponse.json({
      messages: sessionMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      })),
    });
  } catch (error) {
    console.error("[chat/session] Error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении сеанса чата" },
      { status: 500 }
    );
  }
}

