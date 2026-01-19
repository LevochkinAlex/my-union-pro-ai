import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";
import { sendUserNotification } from "@/lib/notifications";
import { invalidateChatCache, invalidateUserChatsCache } from "@/lib/cache-invalidation";

/**
 * POST /api/ppo-head/chats/[id]/invite
 * Пригласить участников в групповой чат
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

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.id;
    const { participantIds } = await request.json();

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: "Выберите участников для приглашения" },
        { status: 400 }
      );
    }

    // Проверяем, что чат существует и является групповым
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        type: true,
        name: true,
        matrixRoomId: true,
        createdById: true, // Добавляем createdById для проверки прав
        participants: {
          where: {
            leftAt: null,
          },
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json(
        { error: "Чат не найден" },
        { status: 404 }
      );
    }

    if (chat.type !== "GROUP") {
      return NextResponse.json(
        { error: "Можно приглашать только в групповые чаты" },
        { status: 400 }
      );
    }

    // Проверяем, что Председатель является создателем или админом группы
    const isAdmin = chat.createdById === chairman.id || 
      chat.participants.some(p => p.userId === chairman.id && p.role === "admin");

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Только администратор группы может приглашать участников" },
        { status: 403 }
      );
    }

    // Проверяем, что все участники принадлежат организации Председателя
    const members = await prisma.user.findMany({
      where: {
        id: { in: participantIds },
        organizationId: chairman.organizationId!,
      },
      select: { id: true },
    });

    if (members.length !== participantIds.length) {
      return NextResponse.json(
        { error: "Некоторые участники не найдены или не принадлежат вашей организации" },
        { status: 400 }
      );
    }

    // Фильтруем уже существующих участников
    const existingParticipantIds = chat.participants.map((p) => p.userId);
    const newParticipantIds = participantIds.filter(
      (id: string) => !existingParticipantIds.includes(id)
    );

    if (newParticipantIds.length === 0) {
      return NextResponse.json(
        { error: "Все выбранные пользователи уже являются участниками группы" },
        { status: 400 }
      );
    }

    // Получаем информацию о новых участниках для сообщения
    const newMembers = await prisma.user.findMany({
      where: { id: { in: newParticipantIds } },
      select: { id: true, firstName: true, lastName: true },
    });

    // Добавляем новых участников
    await prisma.chatParticipant.createMany({
      data: newParticipantIds.map((userId: string) => ({
        chatId,
        userId,
        role: "member",
        invitedById: chairman.id,
      })),
    });

    // Формируем имена добавленных участников
    const memberNames = newMembers
      .map(m => `${m.firstName || ""} ${m.lastName || ""}`.trim() || "Участник")
      .join(", ");

    // Создаём системное сообщение в чате
    const systemMessage = newMembers.length === 1
      ? `👤 ${memberNames} добавлен(а) в группу`
      : `👥 Добавлены участники: ${memberNames}`;

    // TODO: Отправляем системное сообщение через Matrix API
    // await sendMatrixMessage(...);

    // Обновляем lastMessageAt в чате
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
      },
    });

    // Log action if this is a ticket chat (находим тикет по matrixRoomId)
    if (chat.matrixRoomId) {
      const ticket = await prisma.ticket.findUnique({
        where: { matrixRoomId: chat.matrixRoomId },
        select: { id: true },
      });
      
      if (ticket) {
        await prisma.ticketActionLog.create({
          data: {
            ticketId: ticket.id,
            userId: chairman.id,
            actionType: 'participant_added',
            description: `Добавлены участники: ${memberNames}`,
            metadata: {
              addedUserIds: newParticipantIds,
              addedBy: chairman.id,
            },
          },
        });
      }
    }

    // Инвалидируем кеш чата и списка чатов для всех новых участников
    await invalidateChatCache(chatId);
    await Promise.all(
      newParticipantIds.map((userId: string) => invalidateUserChatsCache(userId))
    );
    // Также инвалидируем кеш для председателя
    await invalidateUserChatsCache(chairman.id);

    // Отправляем уведомления приглашённым участникам
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    
    // Определяем название чата и URL для уведомления
    // Если чат связан с обращением, используем название "Обращение #..."
    let ticket = null;
    if (chat.matrixRoomId) {
      ticket = await prisma.ticket.findUnique({
        where: { matrixRoomId: chat.matrixRoomId },
        select: { id: true, publicId: true },
      });
    }
    
    const isAppealChat = !!ticket;
    const chatName = isAppealChat && ticket?.publicId
      ? `Обращение #${ticket.publicId}`
      : (chat.name || "группу");
    
    // URL для уведомления: если это обращение, ссылаемся на страницу обращения, иначе на чат
    const notificationUrl = isAppealChat && ticket?.id
      ? `${baseUrl}/dashboard/appeals/${ticket.id}`
      : `${baseUrl}/dashboard/chat?chatId=${chatId}`;
    
    // Тип уведомления: для обращений используем ticket_response, иначе chat_message
    const notificationType = isAppealChat ? "ticket_response" : "chat_message";
    const notificationTitle = isAppealChat
      ? `📋 Вас добавили в обращение`
      : "👥 Вас добавили в группу";
    
    for (const member of newMembers) {
      try {
        await sendUserNotification({
          userId: member.id,
          type: notificationType,
          title: notificationTitle,
          body: `Вы добавлены в "${chatName}"`,
          url: notificationUrl,
          senderName: `${chairman.firstName || ""} ${chairman.lastName || ""}`.trim() || "Председатель",
        });
      } catch (notifyError) {
        console.error(`[invite] Failed to notify user ${member.id}:`, notifyError);
      }
    }

    return NextResponse.json({
      success: true,
      invitedCount: newParticipantIds.length,
      invitedNames: memberNames,
    });
  } catch (error: any) {
    console.error("[ppo-head/chats] POST invite error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при приглашении участников",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

