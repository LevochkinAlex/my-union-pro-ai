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

    // Session ID format: session-{timestamp}
    const sessionTimestamp = parseInt(sessionId.replace("session-", ""));
    
    if (isNaN(sessionTimestamp)) {
      return NextResponse.json(
        { error: "Неверный формат ID сеанса" },
        { status: 400 }
      );
    }

    // Get all messages for this user
    const allMessages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Find session boundaries using the same 1-hour gap logic
    const ONE_HOUR = 60 * 60 * 1000;
    let sessionMessages: typeof allMessages = [];
    let lastTime: Date | null = null;
    let foundSession = false;
    let currentSessionStart: Date | null = null;

    for (const msg of allMessages) {
      // Check if this is a new session boundary
      if (!lastTime || new Date(msg.createdAt).getTime() - new Date(lastTime).getTime() > ONE_HOUR) {
        // Starting a new session
        if (currentSessionStart && new Date(currentSessionStart).getTime() === sessionTimestamp) {
          // Found our session, but it's complete now
          foundSession = true;
          break;
        }
        // Reset for new session
        currentSessionStart = msg.createdAt;
        sessionMessages = [msg];
      } else {
        // Continue current session
        sessionMessages.push(msg);
      }

      // Check if current session matches our target
      if (currentSessionStart && new Date(currentSessionStart).getTime() === sessionTimestamp) {
        foundSession = true;
      }

      lastTime = msg.createdAt;
    }

    if (!foundSession || sessionMessages.length === 0) {
      return NextResponse.json(
        { error: "Сеанс чата не найден" },
        { status: 404 }
      );
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

