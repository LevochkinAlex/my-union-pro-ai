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

    await requireChatAccess(chatId, userId);

    const body = await request.json();
    const { emoji } = body;

    if (!emoji) {
      return NextResponse.json({ error: "Эмодзи не указан" }, { status: 400 });
    }

    // Проверяем, есть ли уже такая реакция от этого пользователя
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
        where: {
          id: existingReaction.id,
        },
      });
    } else {
      // Добавляем реакцию
      await prisma.chatMessageReaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });
    }

    // Получаем все реакции для этого сообщения
    const reactions = await prisma.chatMessageReaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Группируем по эмодзи
    const groupedReactions = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push(reaction.user.id);
      return acc;
    }, {} as Record<string, { emoji: string; count: number; users: string[] }>);

    return NextResponse.json({
      reactions: Object.values(groupedReactions),
    });
  } catch (error: any) {
    console.error("[POST /api/chat/[chatId]/messages/[messageId]/reactions] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка добавления реакции" },
      { status: 500 }
    );
  }
}
