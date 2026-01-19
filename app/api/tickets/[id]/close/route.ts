import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendMassNotification } from '@/lib/notifications';

// Helper to send message to Matrix room
async function sendMatrixMessage(roomId: string, message: string) {
  const MATRIX_BOT_USER_ID = process.env.MATRIX_BOT_USER_ID;
  const MATRIX_BOT_ACCESS_TOKEN = process.env.MATRIX_BOT_ACCESS_TOKEN;
  const MATRIX_SERVER_URL = process.env.NEXT_PUBLIC_MATRIX_SERVER_URL || 'https://matrix.myunion.pro';

  if (!MATRIX_BOT_ACCESS_TOKEN) {
    console.warn('[tickets/close] Matrix bot token not configured');
    return;
  }

  try {
    const txnId = `close_${Date.now()}`;
    const response = await fetch(
      `${MATRIX_SERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${MATRIX_BOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgtype: 'm.notice',
          body: message,
          format: 'org.matrix.custom.html',
          formatted_body: `<strong>🎉 ${message}</strong>`,
        }),
      }
    );
    
    if (!response.ok) {
      console.error('[tickets/close] Failed to send Matrix message:', await response.text());
    }
  } catch (error) {
    console.error('[tickets/close] Error sending Matrix message:', error);
  }
}

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

    // Find ticket by publicId
    const ticket = await prisma.ticket.findFirst({
      where: { 
        publicId: id 
      },
      select: {
        id: true,
        publicId: true,
        title: true,
        status: true,
        organizationId: true,
        matrixRoomId: true,
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

    // Update ticket
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'RESOLVED',
        resolved: true,
        resolvedAt: new Date(),
        helpfulRating: rating ? Math.min(5, Math.max(1, rating)) : null,
        helpfulRatingComment: comment || null,
        helpfulRatingAt: new Date(),
      },
    });

    // Send "Мой вопрос решен" message to Matrix chat
    if (ticket.matrixRoomId) {
      const closeMessage = `Обращение закрыто пользователем ${userName}.\n\nОценка: ${ratingStars} (${rating}/5)${comment ? `\nКомментарий: ${comment}` : ''}`;
      await sendMatrixMessage(ticket.matrixRoomId, closeMessage);
    }

    // Get all chat participants (excluding the ticket creator)
    let participantUserIds: string[] = [];
    if (ticket.matrixRoomId) {
      const chat = await prisma.chat.findUnique({
        where: { matrixRoomId: ticket.matrixRoomId },
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

    // Send notifications to all participants
    if (participantUserIds.length > 0) {
      const notificationTitle = `Обращение #${ticket.publicId} закрыто`;
      const notificationBody = `${userName} закрыл обращение. Оценка: ${rating}/5${comment ? `. Комментарий: ${comment}` : ''}`;
      
      // Create in-app notifications for all participants
      await prisma.userNotification.createMany({
        data: participantUserIds.map(userId => ({
          userId,
          type: 'TICKET',
          title: notificationTitle,
          body: notificationBody,
          url: `/dashboard/appeals/ppo-head?id=${ticket.publicId}`,
        })),
      });
      
      // Send push and email notifications
      await sendMassNotification({
        userIds: participantUserIds,
        title: notificationTitle,
        body: notificationBody,
        url: `/dashboard/appeals/ppo-head?id=${ticket.publicId}`,
        type: 'ticket_closed',
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
