import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUserPermissions } from "@/lib/staff-permissions";
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

    const perm = await checkUserPermissions(session.user.id, "chats_create");
    if (!perm.hasAccess || !perm.organizationId) {
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
    // Если createdById не указан (старые чаты), разрешаем если пользователь - админ группы
    const isAdmin = chat.createdById === session.user.id || 
      (chat.createdById === null && chat.participants.some(p => p.userId === session.user.id && p.role === "admin")) ||
      chat.participants.some(p => p.userId === session.user.id && p.role === "admin");

    if (!isAdmin) {
      // Для обращений (тикетов) разрешаем председателю добавлять участников
      const ticket = await prisma.ticket.findFirst({
        where: { chatId: chatId },
      });
      const isTicketChat = !!ticket;
      if (!isTicketChat) {
        return NextResponse.json(
          { error: "Только администратор группы может приглашать участников" },
          { status: 403 }
        );
      }
      // Если это обращение и председатель еще не админ, делаем его админом
      const chairmanParticipant = chat.participants.find(p => p.userId === session.user.id);
      if (!chairmanParticipant || chairmanParticipant.role !== "admin") {
        await prisma.chatParticipant.updateMany({
          where: {
            chatId,
            userId: session.user.id,
          },
          data: {
            role: "admin",
          },
        });
      }
    }

    // Проверяем, что все участники принадлежат организации Председателя
    const members = await prisma.user.findMany({
      where: {
        id: { in: participantIds },
        organizationId: perm.organizationId!,
      },
      select: { id: true },
    });

    if (members.length !== participantIds.length) {
      return NextResponse.json(
        { error: "Некоторые участники не найдены или не принадлежат вашей организации" },
        { status: 400 }
      );
    }

    // Проверяем всех участников (включая тех, кто вышел - leftAt !== null)
    const allParticipants = await prisma.chatParticipant.findMany({
      where: { chatId },
      select: { userId: true, leftAt: true },
    });
    
    const existingParticipantIds = chat.participants.map((p) => p.userId);
    const allParticipantIds = allParticipants.map((p) => p.userId);
    
    // Разделяем на новых и тех, кто вышел и возвращается
    const newParticipantIds: string[] = [];
    const returningParticipantIds: string[] = [];
    
    for (const userId of participantIds) {
      if (existingParticipantIds.includes(userId)) {
        // Уже активный участник - пропускаем
        continue;
      }
      
      const existingParticipant = allParticipants.find(p => p.userId === userId);
      if (existingParticipant && existingParticipant.leftAt) {
        // Участник вышел ранее - восстанавливаем
        returningParticipantIds.push(userId);
      } else if (!existingParticipant) {
        // Новый участник
        newParticipantIds.push(userId);
      }
    }

    if (newParticipantIds.length === 0 && returningParticipantIds.length === 0) {
      return NextResponse.json(
        { error: "Все выбранные пользователи уже являются участниками группы" },
        { status: 400 }
      );
    }

    // Получаем информацию о всех добавляемых участниках для сообщения
    const allAddingIds = [...newParticipantIds, ...returningParticipantIds];
    const newMembers = await prisma.user.findMany({
      where: { id: { in: allAddingIds } },
      select: { id: true, firstName: true, lastName: true },
    });

    // Восстанавливаем участников, которые ранее вышли
    if (returningParticipantIds.length > 0) {
      await prisma.chatParticipant.updateMany({
        where: {
          chatId,
          userId: { in: returningParticipantIds },
        },
        data: {
          leftAt: null,
          role: "member",
          invitedById: session.user.id,
          joinedAt: new Date(),
        },
      });
    }

    // Добавляем новых участников
    if (newParticipantIds.length > 0) {
      await prisma.chatParticipant.createMany({
        data: newParticipantIds.map((userId: string) => ({
          chatId,
          userId,
          role: "member",
          invitedById: session.user.id,
        })),
        skipDuplicates: true,
      });
    }

    // Формируем имена добавленных участников
    const memberNames = newMembers
      .map(m => `${m.firstName || ""} ${m.lastName || ""}`.trim() || "Участник")
      .join(", ");

    // Создаём системное сообщение в чате
    const systemMessage = newMembers.length === 1
      ? `👤 ${memberNames} добавлен(а) в группу`
      : `👥 Добавлены участники: ${memberNames}`;

    // TODO: Отправить системное сообщение в чат

    // Обновляем lastMessageAt в чате
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
      },
    });

    // Log action if this is a ticket chat (находим тикет по chatId)
    const ticketForLog = await prisma.ticket.findFirst({
      where: { chatId: chatId },
      select: { id: true },
    });
    
    if (ticketForLog) {
      await prisma.ticketActionLog.create({
        data: {
          ticketId: ticketForLog.id,
          userId: session.user.id,
          actionType: 'participant_added',
          description: `Добавлены участники: ${memberNames}`,
          metadata: {
            addedUserIds: newParticipantIds,
            addedBy: session.user.id,
          },
        },
      });
    }

    // Инвалидируем кеш чата и списка чатов для всех новых участников
    await invalidateChatCache(chatId);
    await Promise.all(
      newParticipantIds.map((userId: string) => invalidateUserChatsCache(userId))
    );
    // Также инвалидируем кеш для председателя
    await invalidateUserChatsCache(session.user.id);

    // Отправляем уведомления приглашённым участникам
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
    
    // Определяем название чата и URL для уведомления
    // Если чат связан с обращением, используем название "Обращение #..."
    const ticket = await prisma.ticket.findFirst({
      where: { chatId: chatId },
      select: { id: true, publicId: true },
    });
    
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
          senderName: `${session.user.firstName || ""} ${session.user.lastName || ""}`.trim() || "Председатель",
        });
      } catch (notifyError) {
        console.error(`[invite] Failed to notify user ${member.id}:`, notifyError);
      }
    }

    return NextResponse.json({
      success: true,
      invitedCount: allAddingIds.length,
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

