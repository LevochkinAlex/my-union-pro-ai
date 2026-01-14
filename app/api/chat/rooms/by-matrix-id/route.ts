import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/chat/rooms/by-matrix-id?roomId=xxx - Get chat ID by Matrix room ID
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roomId = request.nextUrl.searchParams.get('roomId');
    if (!roomId) {
      return NextResponse.json({ error: 'Missing roomId' }, { status: 400 });
    }

    const chat = await prisma.chat.findFirst({
      where: { matrixRoomId: roomId },
      select: { 
        id: true, 
        name: true, 
        description: true,
        type: true,
        iconUrl: true,
        createdById: true,
      }
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      chatId: chat.id, 
      name: chat.name,
      description: chat.description,
      type: chat.type,
      iconUrl: chat.iconUrl,
      isOwner: chat.createdById === session.user.id,
    });
  } catch (error) {
    console.error('Error getting chat by matrix ID:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
