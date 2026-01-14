import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/chat/[id]
 * Get chat by ID with matrixRoomId
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Find chat by ID
    const chat = await prisma.chat.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        name: true,
        matrixRoomId: true,
        participants: {
          where: { userId: session.user.id },
          select: { id: true },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Check if user is participant
    if (chat.participants.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ chat });
  } catch (error) {
    console.error('[chat/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to get chat' }, { status: 500 });
  }
}
