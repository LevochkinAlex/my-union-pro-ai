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

    // TODO: Реакции теперь обрабатываются через Matrix API
    // Matrix поддерживает аннотации (реакции) через m.annotation события
    return NextResponse.json(
      { error: "Реакции временно недоступны (миграция на Matrix API)" },
      { status: 501 }
    );

    /* Временная заглушка
    const message = null as any;

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
