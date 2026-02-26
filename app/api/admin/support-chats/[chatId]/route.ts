import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupportUserId } from "@/lib/support-user";

function requireSuperAdmin() {
  return async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as { role?: string }).role !== "SUPER_ADMIN") {
      return { ok: false as const, status: 403 };
    }
    return { ok: true as const, session };
  };
}

/**
 * GET /api/admin/support-chats/[chatId]
 * Сообщения чата техподдержки (для суперадмина). Чат должен быть с участием support-пользователя.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  const check = await requireSuperAdmin()();
  if (!check.ok) return NextResponse.json({ error: "Forbidden" }, { status: check.status });

  const { chatId } = await context.params;
  const supportUserId = await getSupportUserId();
  if (!supportUserId) {
    return NextResponse.json({ error: "Support user not configured" }, { status: 500 });
  }

  const participant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId: supportUserId, leftAt: null },
  });
  if (!participant) {
    return NextResponse.json({ error: "Chat not found or not a support chat" }, { status: 404 });
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

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
  });

  const clientUser = chat.participants.find((p) => p.userId !== supportUserId)?.user ?? null;

  return NextResponse.json({
    chat: {
      id: chat.id,
      type: chat.type,
      createdAt: chat.createdAt,
    },
    client: clientUser,
    supportUserId,
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      messageType: m.messageType,
      createdAt: m.createdAt,
      senderId: m.senderId,
      sender: m.sender,
    })),
  });
}

/**
 * POST /api/admin/support-chats/[chatId]
 * Отправить сообщение в чат от имени техподдержки (суперадмин).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  const check = await requireSuperAdmin()();
  if (!check.ok) return NextResponse.json({ error: "Forbidden" }, { status: check.status });

  const { chatId } = await context.params;
  const supportUserId = await getSupportUserId();
  if (!supportUserId) {
    return NextResponse.json({ error: "Support user not configured" }, { status: 500 });
  }

  const participant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId: supportUserId, leftAt: null },
  });
  if (!participant) {
    return NextResponse.json({ error: "Chat not found or not a support chat" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      chatId,
      senderId: supportUserId,
      content,
      messageType: "text",
    },
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
  });

  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessageId: message.id,
      lastMessageAt: message.createdAt,
    },
  });

  return NextResponse.json({
    message: {
      id: message.id,
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt,
      senderId: message.senderId,
      sender: message.sender,
    },
  });
}
