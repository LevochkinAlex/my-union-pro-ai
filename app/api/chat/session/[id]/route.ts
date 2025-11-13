import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Get messages for a specific chat session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  console.log("[chat/session] ===== REQUEST START =====");
  
  try {
    // Await params if it's a Promise (Next.js 15+)
    const resolvedParams = params instanceof Promise ? await params : params;
    console.log("[chat/session] Raw params:", resolvedParams);
    
    const session = await getServerSession(authOptions);
    console.log("[chat/session] Session check complete");

    if (!session?.user?.id) {
      console.error("[chat/session] Not authenticated");
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const sessionId = resolvedParams.id;
    console.log("[chat/session] Requested session ID:", sessionId);

    // Session ID format: session-{timestamp}
    const sessionTimestamp = parseInt(sessionId.replace("session-", ""));
    
    if (isNaN(sessionTimestamp)) {
      console.error("[chat/session] Invalid session ID format:", sessionId);
      return NextResponse.json(
        { error: "Неверный формат ID сеанса" },
        { status: 400 }
      );
    }
    
    console.log("[chat/session] Parsed timestamp:", sessionTimestamp, "Date:", new Date(sessionTimestamp));

    // Get all messages for this user
    const allMessages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log("[chat/session] Total messages for user:", allMessages.length);

    if (allMessages.length === 0) {
      console.error("[chat/session] No messages found for user");
      return NextResponse.json(
        { error: "Нет сообщений" },
        { status: 404 }
      );
    }

    // Find session boundaries using the same 1-hour gap logic
    console.log("[chat/session] Starting session boundary analysis...");
    const ONE_HOUR = 60 * 60 * 1000;
    const sessions: Array<{ startTime: number; messages: typeof allMessages }> = [];
    let currentSessionMessages: typeof allMessages = [];
    let lastTime: Date | null = null;

    try {
      for (const msg of allMessages) {
        if (!lastTime || new Date(msg.createdAt).getTime() - new Date(lastTime).getTime() > ONE_HOUR) {
          // Starting a new session
          if (currentSessionMessages.length > 0) {
            sessions.push({
              startTime: new Date(currentSessionMessages[0].createdAt).getTime(),
              messages: currentSessionMessages,
            });
          }
          currentSessionMessages = [msg];
        } else {
          currentSessionMessages.push(msg);
        }
        lastTime = msg.createdAt;
      }

      // Don't forget the last session
      if (currentSessionMessages.length > 0) {
        sessions.push({
          startTime: new Date(currentSessionMessages[0].createdAt).getTime(),
          messages: currentSessionMessages,
        });
      }
      console.log("[chat/session] Session boundary analysis complete");
    } catch (loopError) {
      console.error("[chat/session] Error during session parsing:", loopError);
      throw loopError;
    }

    console.log("[chat/session] Found sessions:", sessions.length);
    console.log("[chat/session] Session start times:", sessions.map(s => ({
      timestamp: s.startTime,
      date: new Date(s.startTime).toISOString(),
      messageCount: s.messages.length
    })));
    
    // Find the session matching our ID
    const targetSession = sessions.find((s) => s.startTime === sessionTimestamp);

    if (!targetSession || targetSession.messages.length === 0) {
      console.error("[chat/session] Session not found! Looking for timestamp:", sessionTimestamp);
      console.error("[chat/session] Available timestamps:", sessions.map(s => s.startTime));
      return NextResponse.json(
        { error: "Сеанс чата не найден" },
        { status: 404 }
      );
    }
    
    console.log("[chat/session] Found target session with", targetSession.messages.length, "messages");

    const sessionMessages = targetSession.messages;

    return NextResponse.json({
      messages: sessionMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      })),
    });
  } catch (error) {
    console.error("[chat/session] ===== ERROR CAUGHT =====");
    console.error("[chat/session] Error type:", typeof error);
    console.error("[chat/session] Error:", error);
    if (error instanceof Error) {
      console.error("[chat/session] Error message:", error.message);
      console.error("[chat/session] Error stack:", error.stack);
    }
    return NextResponse.json(
      { error: "Ошибка при получении сеанса чата" },
      { status: 500 }
    );
  }
}

