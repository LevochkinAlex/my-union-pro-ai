import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendMassNotification } from '@/lib/notifications';
import { checkUserPermissions } from '@/lib/staff-permissions';

/**
 * POST /api/ppo-head/appeals/[id]/force-close
 * Принудительное закрытие обращения председателем с указанием причины
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "appeals_manage");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        {
          error: "Недостаточно прав для принудительного закрытия",
          requiredPermission: "appeals_manage",
          denyReason: perm.denyReason || "MISSING_PERMISSION",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { reason } = await request.json();

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'Укажите причину закрытия обращения' },
        { status: 400 }
      );
    }

    const publicIdNormalized = typeof id === "string" ? id.replace(/-/g, "") : id;
    // Получаем обращение
    const ticket = await prisma.ticket.findFirst({
      where: { OR: [{ publicId: publicIdNormalized }, { id }] },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        organization: {
          select: { id: true },
        },
        chat: {
          include: {
            participants: {
              where: { leftAt: null },
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Обращение не найдено' },
        { status: 404 }
      );
    }

    if (ticket.organizationId !== perm.organizationId) {
      return NextResponse.json(
        { error: 'Нет доступа к обращению другой организации' },
        { status: 403 }
      );
    }

    // Проверяем, что обращение еще не закрыто
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      return NextResponse.json(
        { error: 'Обращение уже закрыто' },
        { status: 400 }
      );
    }

    // Закрываем обращение (сбрасываем просрочку, чтобы не показывать «Просрочено» у закрытых)
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLOSED',
        resolved: true,
        resolvedAt: new Date(),
        rejectionReason: reason.trim(),
        isOverdue: false,
      },
    });

    // Отправляем сообщение в чат обращения и архивируем чат
    if (ticket.chatId) {
      const chairmanName = [session.user.firstName, session.user.lastName]
        .filter(Boolean)
        .join(' ') || 'Председатель';
      const closeMessage = `Обращение принудительно закрыто председателем ${chairmanName}.\n\nПричина: ${reason.trim()}`;
      
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004'}/api/chat/${ticket.chatId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Token': process.env.INTERNAL_API_TOKEN || '',
            },
            body: JSON.stringify({
              content: closeMessage,
              senderUserId: session.user.id,
            }),
          }
        ).catch((err) => {
          console.error('[appeals/force-close] Error sending close message:', err);
        });
        
        // Архивируем чат при закрытии обращения
        await prisma.chat.update({
          where: { id: ticket.chatId },
          data: { archivedAt: new Date() },
        });
      } catch (err) {
        console.error('[appeals/force-close] Error:', err);
      }
    }

    // Получаем ID участников чата для уведомлений
    const participantUserIds =
      ticket.chat?.participants
        ?.map((p) => p.userId)
        .filter((uid) => uid !== session.user.id) || [];

    // Добавляем автора обращения, если его нет в участниках
    if (
      ticket.user.id !== session.user.id &&
      !participantUserIds.includes(ticket.user.id)
    ) {
      participantUserIds.push(ticket.user.id);
    }

    // Отправляем уведомления
    if (participantUserIds.length > 0) {
      const chairmanName = [session.user.firstName, session.user.lastName]
        .filter(Boolean)
        .join(' ') || 'Председатель';
      const notificationTitle = `Обращение #${ticket.publicId} закрыто`;
      const notificationBody = `${chairmanName} закрыл обращение. Причина: ${reason.trim()}`;

      // Создаем in-app уведомления
      await prisma.userNotification.createMany({
        data: participantUserIds.map((userId) => ({
          userId,
          type: 'TICKET',
          title: notificationTitle,
          body: notificationBody,
          url: `/dashboard/appeals/${ticket.id}`,
        })),
      });

      // Отправляем push и email уведомления
      await sendMassNotification({
        userIds: participantUserIds,
        title: notificationTitle,
        body: notificationBody,
        url: `/dashboard/appeals/${ticket.id}`,
        type: 'ticket_closed',
      });
    }

    // Логируем действие
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: 'force_closed',
        description: `Обращение принудительно закрыто председателем. Причина: ${reason.trim()}`,
        metadata: {
          reason: reason.trim(),
          closedBy: session.user.id,
          participantsNotified: participantUserIds.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      ticket: updatedTicket,
      message: 'Обращение успешно закрыто',
    });
  } catch (error: any) {
    console.error('[appeals/force-close] Error:', error);
    return NextResponse.json(
      {
        error: 'Ошибка закрытия обращения',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
