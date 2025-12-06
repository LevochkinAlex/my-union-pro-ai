import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST - добавление/удаление реакции на сообщение
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
    const { emoji } = await request.json();

    if (!emoji) {
      return NextResponse.json({ error: "Эмодзи не указан" }, { status: 400 });
    }

    // Проверяем, что пользователь является участником чата
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participant1Id: true,
        participant2Id: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      return NextResponse.json({ error: "Нет доступа к этому чату" }, { status: 403 });
    }

    // Получаем сообщение с текущими реакциями
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        chatId: true,
        reactions: true,
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
    }

    if (message.chatId !== chatId) {
      return NextResponse.json({ error: "Сообщение не принадлежит этому чату" }, { status: 403 });
    }

    // Парсим текущие реакции
    const reactions = (message.reactions as Record<string, string[]> | null) || {};

    // Проверяем, есть ли уже реакция от этого пользователя с этим эмодзи
    const emojiReactions = reactions[emoji] || [];
    const hasReaction = emojiReactions.includes(userId);

    if (hasReaction) {
      // Удаляем реакцию
      const updatedReactions = { ...reactions };
      updatedReactions[emoji] = emojiReactions.filter((id) => id !== userId);
      
      // Удаляем ключ, если массив пуст
      if (updatedReactions[emoji].length === 0) {
        delete updatedReactions[emoji];
      }

      await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          reactions: updatedReactions,
        },
      });
    } else {
      // Добавляем реакцию
      const updatedReactions = {
        ...reactions,
        [emoji]: [...emojiReactions, userId],
      };

      await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          reactions: updatedReactions,
        },
      });
    }

    // Получаем обновленное сообщение с информацией о пользователях
    const updatedMessage = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        reactions: true,
      },
    });

    // Получаем информацию о пользователях для реакций
    const allUserIds = new Set<string>();
    const finalReactions = (updatedMessage?.reactions as Record<string, string[]> | null) || {};
    Object.values(finalReactions).forEach((userIds) => {
      userIds.forEach((id) => allUserIds.add(id));
    });

    const users = await prisma.user.findMany({
      where: {
        id: { in: Array.from(allUserIds) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
      },
    });

    // Формируем ответ с реакциями и пользователями
    const reactionsWithUsers: Record<string, { userIds: string[]; users: typeof users }> = {};
    Object.entries(finalReactions).forEach(([emoji, userIds]) => {
      reactionsWithUsers[emoji] = {
        userIds,
        users: users.filter((u) => userIds.includes(u.id)),
      };
    });

    return NextResponse.json({ reactions: reactionsWithUsers });
  } catch (error: any) {
    console.error("[chat] POST reaction Error:", error);
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

