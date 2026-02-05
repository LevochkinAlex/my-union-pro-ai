import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar } from "@/lib/api-helpers";

// GET /api/chat/[chatId]/participants - получить список участников чата
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> | { chatId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId } = resolvedParams;
    const userId = session.user.id;

    // Проверяем, является ли пользователь участником чата
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        leftAt: null,
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Нет доступа к чату" }, { status: 403 });
    }

    // Получаем всех участников чата
    const participants = await prisma.chatParticipant.findMany({
      where: {
        chatId,
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' }, // Админы первыми
        { joinedAt: 'asc' }, // Затем по дате присоединения
      ],
    });

    // Нормализуем аватары
    const formattedParticipants = participants.map(p => ({
      id: p.id,
      userId: p.userId,
      role: p.role,
      user: normalizeUserAvatar(p.user),
    }));

    return NextResponse.json({ participants: formattedParticipants });
  } catch (error) {
    console.error("[api/chat/[chatId]/participants] Error:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки участников" },
      { status: 500 }
    );
  }
}

// POST /api/chat/[chatId]/participants - добавить участников в чат
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> | { chatId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { chatId } = resolvedParams;
    const userId = session.user.id;

    // Проверяем, является ли пользователь админом чата
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        role: 'admin',
        leftAt: null,
      },
    });

    if (!participant) {
      return NextResponse.json({ error: "Только админ может добавлять участников" }, { status: 403 });
    }

    // Проверяем, что чат является групповым и не чатом заседания
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true, meetingId: true },
    });

    if (!chat || (chat.type !== 'GROUP' && chat.type !== 'CHANNEL')) {
      return NextResponse.json({ error: "Участников можно добавлять только в групповые чаты" }, { status: 400 });
    }

    if (chat.meetingId) {
      return NextResponse.json(
        { error: "Участников чата заседания можно добавлять только через редактирование повестки дня или протокола в разделе «Документы» (у председателя или выборного органа)" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: "Необходимо указать userIds" }, { status: 400 });
    }

    // Валидация формата userIds
    const validUserIds = userIds.filter((id: any) => 
      typeof id === 'string' && id.trim().length > 0 && id.length <= 100
    );

    if (validUserIds.length === 0) {
      return NextResponse.json({ error: "Некорректный формат userIds" }, { status: 400 });
    }

    if (validUserIds.length !== userIds.length) {
      return NextResponse.json({ error: "Некоторые userIds имеют некорректный формат" }, { status: 400 });
    }

    // Ограничение на количество добавляемых участников за раз
    if (validUserIds.length > 50) {
      return NextResponse.json({ error: "Можно добавить не более 50 участников за раз" }, { status: 400 });
    }

    // Получаем существующих участников
    const existingParticipants = await prisma.chatParticipant.findMany({
      where: {
        chatId,
        userId: { in: validUserIds },
        leftAt: null,
      },
      select: { userId: true },
    });

    const existingUserIds = existingParticipants.map(p => p.userId);
    const newUserIds = validUserIds.filter((id: string) => !existingUserIds.includes(id));

    if (newUserIds.length === 0) {
      return NextResponse.json({ 
        message: "Все указанные пользователи уже являются участниками чата",
        added: 0 
      });
    }

    // Проверяем, что пользователи существуют
    const users = await prisma.user.findMany({
      where: { id: { in: newUserIds } },
      select: { id: true },
    });

    if (users.length !== newUserIds.length) {
      return NextResponse.json({ error: "Некоторые пользователи не найдены" }, { status: 404 });
    }

    // Добавляем участников
    await prisma.chatParticipant.createMany({
      data: newUserIds.map((newUserId: string) => ({
        chatId,
        userId: newUserId,
        role: 'member',
        invitedById: userId, // Текущий пользователь (админ) приглашает
      })),
    });

    // Инвалидируем кэш для всех добавленных пользователей
    const { invalidateUserChatsCache } = await import('@/lib/chat-redis');
    await Promise.allSettled(
      newUserIds.map((userId: string) => invalidateUserChatsCache(userId))
    );

    return NextResponse.json({ 
      message: `Добавлено участников: ${newUserIds.length}`,
      added: newUserIds.length,
      userIds: newUserIds 
    });
  } catch (error) {
    console.error("[api/chat/[chatId]/participants] POST Error:", error);
    return NextResponse.json(
      { error: "Ошибка добавления участников" },
      { status: 500 }
    );
  }
}
