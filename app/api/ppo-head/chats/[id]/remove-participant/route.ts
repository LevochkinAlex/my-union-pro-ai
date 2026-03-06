import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { sendUserNotification } from "@/lib/notifications";
import { invalidateChatCache, invalidateUserChatsCache } from "@/lib/cache-invalidation";

/**
 * POST /api/ppo-head/chats/[id]/remove-participant
 * Удалить участника из группового чата
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "chats_create");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.id;
    const { participantId } = await request.json();

    if (!participantId) {
      return NextResponse.json(
        { error: "Не указан участник для удаления" },
        { status: 400 }
      );
    }

    // Проверяем, что чат существует и является групповым
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: { leftAt: null },
          select: {
            userId: true,
            role: true,
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.type !== "GROUP") {
      return NextResponse.json(
        { error: "Можно удалять участников только из групповых чатов" },
        { status: 400 }
      );
    }

    // Проверяем права: создатель или админ
    const isAdmin =
      chat.createdById === session.user.id ||
      chat.participants.some(
        (p) => p.userId === session.user.id && p.role === "admin"
      );

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Только администратор группы может удалять участников" },
        { status: 403 }
      );
    }

    // Нельзя удалить самого себя
    if (participantId === session.user.id) {
      return NextResponse.json(
        { error: "Вы не можете удалить себя из группы" },
        { status: 400 }
      );
    }

    // Находим участника
    const participant = chat.participants.find((p) => p.userId === participantId);
    if (!participant) {
      return NextResponse.json(
        { error: "Участник не найден в группе" },
        { status: 404 }
      );
    }

    const participantName = `${participant.user?.firstName || ""} ${participant.user?.lastName || ""}`.trim() || "Участник";

    // Мягкое удаление участника (устанавливаем leftAt)
    await prisma.chatParticipant.updateMany({
      where: {
        chatId,
        userId: participantId,
        leftAt: null,
      },
      data: {
        leftAt: new Date(),
      },
    });

    // Создаём системное сообщение в чате
    const systemMessage = `👤 ${participantName} удалён из группы`;

    // TODO: Отправить системное сообщение в чат

    // Обновляем lastMessage в чате
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
        // lastMessage: systemMessage, // Поле удалено
      },
    });

    // Log action if this is a ticket chat (проверяем через chatId)
    const ticket = await prisma.ticket.findFirst({
      where: { chatId: chatId },
      select: { id: true, publicId: true },
    });
    
    if (ticket?.id) {
      await prisma.ticketActionLog.create({
        data: {
          ticketId: ticket.id,
          userId: session.user.id,
          actionType: "participant_removed",
          description: `Участник ${participantName} удалён из группы`,
          metadata: {
            removedUserId: participantId,
            removedBy: session.user.id,
          },
        },
      });
    }

    // Инвалидируем кеш
    await invalidateChatCache(chatId);
    await invalidateUserChatsCache(participantId);
    await invalidateUserChatsCache(session.user.id);

    // Уведомляем удалённого участника
    const chatName = ticket?.publicId
      ? `Обращение #${ticket.publicId}`
      : chat.name || "группу";

    await sendUserNotification({
      userId: participantId,
      type: "chat_message",
      title: "Вы удалены из группы",
      body: `Вы были удалены из "${chatName}"`,
      url: "/dashboard/chat",
      senderName:
        `${session.user.firstName || ""} ${session.user.lastName || ""}`.trim() ||
        "Председатель",
    });

    return NextResponse.json({
      success: true,
      removedName: participantName,
    });
  } catch (error: any) {
    console.error("[ppo-head/chats] POST remove-participant error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при удалении участника",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
