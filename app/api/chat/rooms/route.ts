import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/chat/rooms - Get user's chats with proper names
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's chats from DB with participants info
    // Only include chats where user is an active participant (not left)
    const chats = await prisma.chat.findMany({
      where: {
        participants: { 
          some: { 
            userId: session.user.id,
            leftAt: null, // User hasn't left the chat
          } 
        }
      },
      select: {
        id: true,
        type: true,
        name: true,
        iconUrl: true,
        matrixRoomId: true,
        ticket: {
          select: { 
            id: true,
            publicId: true,
            status: true,
            resolved: true,
            userId: true, // Creator ID
          }
        },
        participants: {
          where: { leftAt: null }, // Only active participants
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                matrixUserId: true
              }
            }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Format response
    const roomsData = chats
      .filter(chat => chat.matrixRoomId) // Only return migrated chats
      .map(chat => {
        const isDirect = chat.participants.length === 2;
        
        // Get the other participant for DM chats
        const otherParticipant = chat.participants.find(
          p => p.user?.id !== session.user.id
        )?.user;
        
        // Determine display name
        let displayName = '';
        // For ticket chats, use the chat name (e.g., "Обращение #12345")
        if (chat.ticket && chat.name) {
          displayName = chat.name;
        } else if (chat.type === 'GROUP' && chat.name) {
          // For groups with explicit names
          displayName = chat.name;
        } else if (isDirect && otherParticipant) {
          // Check if it's AI bot
          if (otherParticipant.matrixUserId?.includes('ai_assistant') || 
              otherParticipant.matrixUserId?.includes('myunion_bot')) {
            displayName = 'МойСоюз Помощник';
          } else {
            displayName = [otherParticipant.firstName, otherParticipant.lastName]
              .filter(Boolean)
              .join(' ') || 'Пользователь';
          }
        } else {
          // Group chat without name - list participant names
          displayName = chat.participants
            .filter(p => p.user?.id !== session.user.id)
            .map(p => p.user?.firstName)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ') || 'Групповой чат';
        }
        
        // Determine avatar URL
        let avatarUrl: string | null = null;
        const isBot = otherParticipant?.matrixUserId?.includes('myunion_bot') || 
                      otherParticipant?.matrixUserId?.includes('ai_assistant');
        
        if (isBot) {
          avatarUrl = '/icon.png';
        } else if (isDirect && otherParticipant?.avatarUrl) {
          avatarUrl = otherParticipant.avatarUrl;
        } else if (chat.type === 'GROUP' && chat.iconUrl) {
          avatarUrl = chat.iconUrl;
        }
        
        return {
          matrixRoomId: chat.matrixRoomId,
          displayName,
          avatarUrl,
          isDirect,
          isGroup: chat.type === 'GROUP',
          isTicket: !!chat.ticket, // true if this chat is linked to a ticket
          ticketId: chat.ticket?.publicId || null,
          ticketResolved: chat.ticket?.resolved || false,
          ticketStatus: chat.ticket?.status || null,
          isTicketCreator: chat.ticket?.userId === session.user.id, // Is current user the ticket creator
          participantCount: chat.participants.length,
          lastMessage: chat.messages[0]?.content,
          lastMessageTime: chat.messages[0]?.createdAt?.getTime(),
          participants: chat.participants.map(p => ({
            id: p.user?.id,
            firstName: p.user?.firstName,
            lastName: p.user?.lastName,
            avatarUrl: p.user?.avatarUrl,
            matrixUserId: p.user?.matrixUserId
          }))
        };
      });

    return NextResponse.json({ rooms: roomsData });
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
  }
}
