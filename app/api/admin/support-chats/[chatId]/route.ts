import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportUserId } from "@/lib/support-user";
import { invalidateChatCache } from "@/lib/chat-redis";
import { emitNewMessage } from "@/server/socket";
import { ensureSuperAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/support-chats/[chatId]
 * Сообщения чата техподдержки (для суперадмина). Чат должен быть с участием support-пользователя.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> }
) {
  const superCheck = await ensureSuperAdmin();
  if (superCheck.error) return superCheck.error;

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
  const superCheck = await ensureSuperAdmin();
  if (superCheck.error) return superCheck.error;

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

  // Инвалидация кэша — чтобы клиент видел новое сообщение при следующей загрузке
  await invalidateChatCache(chatId).catch((err) =>
    console.error("[admin/support-chats] Cache invalidation error:", err)
  );

  // Отправка через WebSocket — чтобы клиент получил сообщение в реальном времени
  const normalizedMessage = {
    id: message.id,
    chatId,
    senderId: message.senderId,
    sender: message.sender
      ? {
          id: message.sender.id,
          firstName: message.sender.firstName || null,
          lastName: message.sender.lastName || null,
          avatarUrl: message.sender.avatarUrl || null,
        }
      : null,
    content: message.content,
    messageType: message.messageType,
    replyTo: null,
    threadRootId: null,
    attachments: [],
    reactions: {},
    createdAt: message.createdAt,
    editedAt: message.editedAt,
  };
  try {
    emitNewMessage(chatId, normalizedMessage);
  } catch (wsErr) {
    console.error("[admin/support-chats] WebSocket emit error:", wsErr);
  }

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
