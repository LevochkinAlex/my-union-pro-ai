/**
 * POST /api/chat/[chatId]/messages/[messageId]/reactions
 * Добавить/удалить реакцию на сообщение
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireChatAccess } from "@/lib/chat-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string; messageId: string } | Promise<{ chatId: string; messageId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId, messageId } = resolvedParams;
    const userId = session.user.id;

    // Проверяем доступ к чату
    await requireChatAccess(chatId, userId);

    const { emoji } = await request.json();

    if (!emoji) {
      return NextResponse.json({ error: "Emoji не указан" }, { status: 400 });
    }

    // Проверяем существование сообщения
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { chatId: true },
    });

    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    // Проверяем есть ли уже реакция
    const existingReaction = await prisma.chatMessageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    if (existingReaction) {
      // Удаляем реакцию
      await prisma.chatMessageReaction.delete({
        where: { id: existingReaction.id },
      });

      return NextResponse.json({ action: "removed", reaction: null });
    } else {
      // Добавляем реакцию
      const reaction = await prisma.chatMessageReaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      });

      return NextResponse.json({ action: "added", reaction });
    }
  } catch (error: any) {
    console.error("[POST /api/chat/[chatId]/messages/[messageId]/reactions] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка обработки реакции" },
      { status: 500 }
    );
  }
}
