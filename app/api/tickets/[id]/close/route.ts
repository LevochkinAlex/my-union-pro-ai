import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
        status: true,
        organizationId: true,
        user: { select: { id: true } },
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

    // Create notification for organization PPO head if ticket has organization
    if (ticket.organizationId) {
      const ppoHead = await prisma.user.findFirst({
        where: {
          organizationId: ticket.organizationId,
          role: 'PPO_HEAD',
        },
        select: { id: true },
      });
      
      if (ppoHead) {
        await prisma.userNotification.create({
          data: {
            userId: ppoHead.id,
            type: 'TICKET',
            title: `Обращение #${ticket.publicId} закрыто`,
            body: `Оценка: ${rating}/5${comment ? `. Комментарий: ${comment}` : ''}`,
            url: `/dashboard/appeals/${ticket.publicId}`,
          },
        });
      }
    }

    // Log activity
    await prisma.ticketActionLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.user.id,
        actionType: 'status_changed',
        description: `Обращение закрыто с оценкой ${rating}/5`,
        metadata: { rating, comment },
      },
    });

    return NextResponse.json({ 
      success: true, 
      ticket: updatedTicket 
    });
  } catch (error: any) {
    console.error('[tickets/close] Error:', error);
    return NextResponse.json(
      { error: 'Ошибка закрытия обращения', details: error.message },
      { status: 500 }
    );
  }
}
