import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportUserId } from "@/lib/support-user";
import { ensureSuperAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/support-chats
 * Список чатов с техподдержкой для суперадмина (все диалоги пользователей с поддержкой).
 */
export async function GET() {
  const { error } = await ensureSuperAdmin();
  if (error) return error;

  const supportUserId = await getSupportUserId();
  if (!supportUserId) {
    return NextResponse.json({ chats: [] });
  }

  const participants = await prisma.chatParticipant.findMany({
    where: {
      userId: supportUserId,
      leftAt: null,
    },
    select: { chatId: true },
  });
  const chatIds = participants.map((p) => p.chatId);
  if (chatIds.length === 0) {
    return NextResponse.json({ chats: [] });
  }

  const BOT_EMAILS = ["ai-assistant@myunion.pro", "support@myunion.pro"];

  const chats = await prisma.chat.findMany({
    where: { id: { in: chatIds }, type: "PRIVATE" },
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
              phone: true,
            },
          },
        },
      },
      lastMessage: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          senderId: true,
        },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  // Показываем только те диалоги, где пользователь написал хотя бы одно сообщение.
  // Это исключает автосозданные/пустые чаты и чаты только с сообщениями от поддержки.
  const userInitiatedRows = await prisma.chatMessage.findMany({
    where: {
      chatId: { in: chatIds },
      senderId: { not: supportUserId },
    },
    select: { chatId: true },
    distinct: ["chatId"],
  });
  const userInitiatedChatIds = new Set(userInitiatedRows.map((r) => r.chatId));

  const list = chats
    .map((chat) => {
      if (!userInitiatedChatIds.has(chat.id)) return null;
      const clientParticipant = chat.participants.find((p) => p.userId !== supportUserId);
      const user = clientParticipant?.user ?? null;
      if (!user) return null;
      if (user.email && BOT_EMAILS.includes(user.email)) return null;
      const hasMessages = (chat._count?.messages ?? 0) > 0;
      if (!hasMessages) return null;
      const lastName = (chat.lastMessage?.content ?? "").trim();
      const preview = lastName.length > 80 ? lastName.slice(0, 80) + "…" : lastName;
      return {
        chatId: chat.id,
        lastMessageAt: chat.lastMessageAt ?? chat.createdAt,
        lastMessagePreview: preview,
        lastMessageSenderId: chat.lastMessage?.senderId ?? null,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ chats: list });
}
