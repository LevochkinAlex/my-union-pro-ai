import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, verifyMobileAccessToken } from "@/lib/mobile-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> },
) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { userId } = verifyMobileAccessToken(token);
    const { chatId } = await Promise.resolve(params);

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { id: true, leftAt: true },
    });

    if (!participant || participant.leftAt) {
      return NextResponse.json({ error: "Нет доступа к чату" }, { status: 403 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      take: 200,
    });

    return NextResponse.json({
      messages: messages.map((message) => ({
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        content: message.content,
        messageType: message.messageType,
        createdAt: message.createdAt,
        sender: message.sender,
      })),
    });
  } catch (error) {
    console.error("[mobile/chat/messages] error:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки сообщений" },
      { status: 500 },
    );
  }
}
