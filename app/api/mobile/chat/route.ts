import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, verifyMobileAccessToken } from "@/lib/mobile-auth";

export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = verifyMobileAccessToken(token);

    const participants = await prisma.chatParticipant.findMany({
      where: {
        userId,
        leftAt: null,
      },
      orderBy: {
        chat: {
          lastMessageAt: "desc",
        },
      },
      select: {
        chat: {
          select: {
            id: true,
            type: true,
            name: true,
            lastMessageAt: true,
            archivedAt: true,
            participants: {
              where: {
                leftAt: null,
                userId: {
                  not: userId,
                },
              },
              select: {
                userId: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
              },
              take: 1,
            },
            lastMessage: {
              select: {
                id: true,
                content: true,
                createdAt: true,
                senderId: true,
                messageType: true,
              },
            },
          },
        },
      },
      take: 100,
    });

    const chats = participants.map((item) => {
      const other = item.chat.participants[0]?.user;
      const displayName = item.chat.name || (other
        ? `${other.firstName || ""} ${other.lastName || ""}`.trim()
        : "Чат");
      return {
        id: item.chat.id,
        type: item.chat.type,
        name: item.chat.name,
        displayName,
        archivedAt: item.chat.archivedAt,
        lastMessageAt: item.chat.lastMessageAt,
        lastMessage: item.chat.lastMessage
          ? {
              id: item.chat.lastMessage.id,
              content: item.chat.lastMessage.content,
              createdAt: item.chat.lastMessage.createdAt,
              senderId: item.chat.lastMessage.senderId,
              messageType: item.chat.lastMessage.messageType,
            }
          : null,
        otherUser: other || null,
      };
    });

    return NextResponse.json({ chats });
  } catch (error) {
    console.error("[mobile/chat] error:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки чатов" },
      { status: 500 },
    );
  }
}
