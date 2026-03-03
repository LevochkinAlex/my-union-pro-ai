import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendMassNotification } from '@/lib/notifications';
import { appendFileSync } from 'fs';
import { join } from 'path';
// #region agent log
function debugLog(p: { sessionId?: string; location: string; message: string; data?: Record<string, unknown>; hypothesisId?: string }) {
  try { appendFileSync(join(process.cwd(), '.cursor', 'debug-3d28b8.log'), JSON.stringify({ ...p, timestamp: Date.now() }) + '\n'); } catch (_) {}
}
// #endregion

/**
 * POST /api/tickets/[id]/close
 * Close a ticket with rating and comment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { rating, comment } = await request.json();

    // Нормализуем id: в БД publicId хранится без дефиса (35604798), из чата может прийти 3560-4798
    const publicIdNormalized = typeof id === 'string' ? id.replace(/-/g, '') : id;

    // Find ticket by publicId (или по внутреннему id, если передан cuid)
    const ticket = await prisma.ticket.findFirst({
      where: { 
        OR: [{ publicId: publicIdNormalized }, { id }],
      },
      select: {
        id: true,
        publicId: true,
        title: true,
        status: true,
        organizationId: true,
        chatId: true,
        user: { 
          select: { 
            id: true, 
            firstName: true, 
            lastName: true,
            email: true,
          } 
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Обращение не найдено' }, { status: 404 });
    }

    // #region agent log
    debugLog({ sessionId: '3d28b8', location: 'tickets/[id]/close/route.ts', message: 'Close attempt', data: { sessionUserId: session.user.id, ticketId: ticket.id, ticketUserId: ticket.user.id, isAuthor: ticket.user.id === session.user.id, ticketStatus: ticket.status, hasChatId: !!ticket.chatId }, hypothesisId: 'C' });
    // #endregion

    // Only the ticket creator can close it
    if (ticket.user.id !== session.user.id) {
      return NextResponse.json(
        { error: 'Только автор обращения может его закрыть' },
        { status: 403 }
      );
    }

    // Check if already closed
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      return NextResponse.json(
        { error: 'Обращение уже закрыто' },
        { status: 400 }
      );
    }

    const userName = [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(' ') || 'Пользователь';
    const ratingStars = '⭐'.repeat(rating || 0);

    // Update ticket: CLOSED при закрытии пользователем, сбрасываем просрочку
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'CLOSED',
        resolved: true,
        resolvedAt: new Date(),
        helpfulRating: rating ? Math.min(5, Math.max(1, rating)) : null,
        helpfulRatingComment: comment || null,
        helpfulRatingAt: new Date(),
        isOverdue: false,
      },
    });

    // #region agent log
    debugLog({ sessionId: '3d28b8', location: 'tickets/[id]/close/route.ts:afterUpdate', message: 'Ticket closed', data: { ticketId: updatedTicket.id, newStatus: updatedTicket.status }, hypothesisId: 'C' });
    // #endregion

    // Отправляем сообщение в чат обращения и архивируем чат
    if (ticket.chatId) {
      const closeMessage = `Обращение закрыто пользователем ${userName}.\n\nОценка: ${ratingStars} (${rating}/5)${comment ? `\nКомментарий: ${comment}` : ''}`;
      try {
        await prisma.chatMessage.create({
          data: {
            chatId: ticket.chatId,
            senderId: session.user.id,
            content: closeMessage,
            messageType: 'text',
          },
        });

        // Обновляем lastMessageId в чате и архивируем его
        const lastMessage = await prisma.chatMessage.findFirst({
          where: { chatId: ticket.chatId },
          orderBy: { createdAt: 'desc' },
        });

        if (lastMessage) {
          await prisma.chat.update({
            where: { id: ticket.chatId },
            data: {
              lastMessageId: lastMessage.id,
              lastMessageAt: lastMessage.createdAt,
              archivedAt: new Date(), // Архивируем чат при закрытии обращения
            },
          });
        } else {
          // Архивируем чат даже если нет последнего сообщения
          await prisma.chat.update({
            where: { id: ticket.chatId },
            data: {
              archivedAt: new Date(),
            },
          });
        }
      } catch (err) {
        console.error('[tickets/close] Error sending close message:', err);
      }
    }

    // Get all chat participants (excluding the ticket creator)
    let participantUserIds: string[] = [];
    if (ticket.chatId) {
      const chat = await prisma.chat.findUnique({
        where: { id: ticket.chatId },
        select: {
          participants: {
            where: { leftAt: null },
            select: {
              userId: true,
            },
          },
        },
      });
      participantUserIds = chat?.participants
        ?.map(p => p.userId)
        .filter(uid => uid !== session.user.id) || [];
    }

    // Уведомляем участников чата (только через sendMassNotification — он сам создаёт записи в БД и шлёт push/email, иначе получаются дубли)
    if (participantUserIds.length > 0) {
      const notificationTitle = `Обращение #${ticket.publicId} закрыто`;
      const notificationBody = `${userName} закрыл обращение. Оценка: ${rating}/5${comment ? `. Комментарий: ${comment}` : ''}`;

      await sendMassNotification({
        userIds: participantUserIds,
        title: notificationTitle,
        body: notificationBody,
        url: `/dashboard/appeals/ppo-head?id=${ticket.publicId}`,
        type: 'ticket_closed',
        metadata: { ticketId: ticket.id, publicId: ticket.publicId },
      });
    }

    // Log activity
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: 'closed',
        description: `Обращение закрыто пользователем ${userName} с оценкой ${rating}/5`,
        metadata: { 
          rating, 
          comment,
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
    console.error('[tickets/close] Error:', error);
    return NextResponse.json(
      { error: 'Ошибка закрытия обращения', details: error.message },
      { status: 500 }
    );
  }
}
