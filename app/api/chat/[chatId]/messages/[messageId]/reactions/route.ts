import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { 
  requireChatAccess, 
  ChatAccessError 
} from "@/lib/chat-service";

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

    // Проверяем доступ через сервис
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Получаем сообщение
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
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

    // Нормализуем реакции
    const rawReactions = (message.reactions as Record<string, string[] | { userIds: string[] }> | null) || {};
    const reactions: Record<string, string[]> = {};
    
    Object.entries(rawReactions).forEach(([emojiKey, reactionData]) => {
      if (Array.isArray(reactionData)) {
        reactions[emojiKey] = reactionData;
      } else if (reactionData && typeof reactionData === 'object' && Array.isArray(reactionData.userIds)) {
        reactions[emojiKey] = reactionData.userIds;
      }
    });

    // Обновляем реакции (одна реакция на сообщение)
    const updatedReactions: Record<string, string[]> = {};
    let userHadThisEmoji = false;
    
    Object.entries(reactions).forEach(([existingEmoji, userIds]) => {
      if (existingEmoji === emoji && userIds.includes(userId)) {
        userHadThisEmoji = true;
        const filtered = userIds.filter((id) => id !== userId);
        if (filtered.length > 0) {
          updatedReactions[existingEmoji] = filtered;
        }
      } else {
        const filtered = userIds.filter((id) => id !== userId);
        if (filtered.length > 0) {
          updatedReactions[existingEmoji] = filtered;
        }
      }
    });

    if (!userHadThisEmoji) {
      if (updatedReactions[emoji]) {
        updatedReactions[emoji].push(userId);
      } else {
        updatedReactions[emoji] = [userId];
      }
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        reactions: updatedReactions,
      } as any,
    });

    // Получаем информацию о пользователях
    const allUserIds = new Set<string>();
    Object.values(updatedReactions).forEach((userIds) => {
      userIds.forEach((id) => allUserIds.add(id));
    });

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(allUserIds) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
      },
    });

    // Формируем ответ
    const reactionsWithUsers: Record<string, { userIds: string[]; users: typeof users }> = {};
    Object.entries(updatedReactions).forEach(([emojiKey, userIds]) => {
      if (userIds.length > 0) {
        reactionsWithUsers[emojiKey] = {
          userIds,
          users: users.filter((u) => userIds.includes(u.id)),
        };
      }
    });

    return NextResponse.json({ reactions: reactionsWithUsers });
  } catch (error: any) {
    console.error("[chat] POST reaction Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
