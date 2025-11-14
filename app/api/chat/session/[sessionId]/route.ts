import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: { sessionId: string } | Promise<{ sessionId: string }> }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    console.log("[session-api] params received:", resolvedParams);
    const sessionId = resolvedParams?.sessionId;

    if (!sessionId) {
      console.error("[session-api] Missing sessionId param in route handler");
      return NextResponse.json(
        { error: "ID сессии не передан" },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Session ID format: session-{timestamp}
    const sessionTimestamp = parseInt(sessionId.replace("session-", ""));
    if (isNaN(sessionTimestamp)) {
      return NextResponse.json(
        { error: "Неверный формат ID сессии" },
        { status: 400 }
      );
    }

    // Get all messages for user
    const allMessages = await prisma.chatMessage.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(`[session-api] Found ${allMessages.length} total messages for user`);

    if (allMessages.length === 0) {
      return NextResponse.json(
        { error: "Нет сообщений" },
        { status: 404 }
      );
    }

    // Group messages into sessions (more than 1 hour gap = new session)
    const sessions: Array<{ startTime: Date; messages: typeof allMessages }> = [];
    let currentSession: typeof allMessages = [];
    let lastTime: Date | null = null;
    let sessionStartTime: Date | null = null;
    const ONE_HOUR = 60 * 60 * 1000;

    for (const message of allMessages) {
      const messageTime = new Date(message.createdAt).getTime();
      if (!lastTime) {
        currentSession = [message];
        sessionStartTime = message.createdAt;
        lastTime = message.createdAt;
      } else {
        const lastTimeMs = new Date(lastTime).getTime();
        if (messageTime - lastTimeMs > ONE_HOUR) {
          if (currentSession.length > 0 && sessionStartTime) {
            sessions.push({ messages: currentSession, startTime: sessionStartTime });
          }
          currentSession = [message];
          sessionStartTime = message.createdAt;
        } else {
          currentSession.push(message);
        }
      }
      lastTime = message.createdAt;
    }

    if (currentSession.length > 0 && sessionStartTime) {
      sessions.push({ messages: currentSession, startTime: sessionStartTime });
    }

    console.log(`[session-api] Grouped into ${sessions.length} sessions`);

    // Find the session that matches the timestamp
    const requestedSessionId = `session-${sessionTimestamp}`;
    console.log(`[session-api] Looking for session: ${requestedSessionId}`);
    console.log(`[session-api] Session start times: ${sessions.map(s => `session-${s.startTime.getTime()}`).join(', ')}`);
    
    let matchingSession = sessions.find(s => `session-${s.startTime.getTime()}` === requestedSessionId);

    // If exact match not found, try to find closest session
    if (!matchingSession && sessions.length > 0) {
      console.log(`[session-api] No exact match, finding closest session`);
      const closestSession = sessions.reduce((closest, current) => {
        const currentDiff = Math.abs(current.startTime.getTime() - sessionTimestamp);
        const closestDiff = Math.abs(closest.startTime.getTime() - sessionTimestamp);
        return currentDiff < closestDiff ? current : closest;
      });

      const diffMs = Math.abs(closestSession.startTime.getTime() - sessionTimestamp);
      console.log(`[session-api] Closest session diff: ${diffMs}ms`);

      // Use closest session if timestamp is very close (within 60 seconds for tolerance)
      if (diffMs <= 60000) {
        console.log(`[session-api] Using closest session (within tolerance)`);
        matchingSession = closestSession;
      }
    }

    if (!matchingSession) {
      console.log(`[session-api] Session not found: ${requestedSessionId}, returning all messages as fallback`);
      // Fallback: return all messages if specific session not found
      const allSorted = allMessages.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      return NextResponse.json({
        messages: allSorted.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
        })),
      });
    }

    console.log(`[session-api] Found matching session with ${matchingSession.messages.length} messages`);

    const messages = matchingSession.messages.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return NextResponse.json({
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
      {
        error: "Ошибка при получении сессии чата",
        details:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Неизвестная ошибка",
        stack:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.stack
            : undefined,
      },
      { status: 500 }
    );
  }
}
