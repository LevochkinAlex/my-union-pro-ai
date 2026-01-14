import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/chat/notify - Send push notification for new chat message
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { roomId, message } = await request.json();
    if (!roomId || !message) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    // Find chat by matrix room ID
    const chat = await prisma.chat.findFirst({
      where: { matrixRoomId: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        }
      }
    });

    if (!chat) {
      return NextResponse.json({ ok: true }); // No chat found, skip
    }

    // Get sender name
    const senderName = [session.user.firstName, session.user.lastName]
      .filter(Boolean)
      .join(' ') || 'Пользователь';

    // Get recipients (all participants except sender)
    const recipients = chat.participants
      .filter(p => p.user?.id && p.user.id !== session.user.id)
      .map(p => p.user!.id);

    if (recipients.length === 0) {
      return NextResponse.json({ ok: true });
    }

    // Send push to each recipient
    const baseUrl = process.env.NEXTAUTH_URL || 'https://myunion.pro';
    
    await Promise.allSettled(
      recipients.map(userId =>
        fetch(`${baseUrl}/api/push/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Token': process.env.INTERNAL_API_TOKEN || '',
          },
          body: JSON.stringify({
            userId,
            title: senderName,
            message: message.slice(0, 100),
            data: { url: '/dashboard/chat' },
          }),
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error sending chat notification:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
