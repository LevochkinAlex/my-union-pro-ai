import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const MATRIX_SERVER = process.env.MATRIX_HOMESERVER_URL || 'https://matrix.myunion.pro';

/**
 * POST /api/chat/[chatId]/clear
 * Clear chat history
 * mode: 'all' - delete for everyone (redact in Matrix)
 * mode: 'me' - delete only for me (hide locally)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId } = await params;
    const { mode } = await request.json();

    if (!mode || !['all', 'me'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    // Check chat exists and user has access
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        participants: { some: { userId: session.user.id, leftAt: null } },
      },
      select: {
        id: true,
        matrixRoomId: true,
        type: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Get user's Matrix credentials
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { matrixUserId: true, matrixAccessToken: true },
    });

    if (mode === 'all') {
      // Delete for everyone - redact messages in Matrix
      if (chat.matrixRoomId && user?.matrixAccessToken) {
        try {
          // Get all messages from Matrix room
          const messagesResponse = await fetch(
            `${MATRIX_SERVER}/_matrix/client/v3/rooms/${encodeURIComponent(chat.matrixRoomId)}/messages?dir=b&limit=1000`,
            {
              headers: {
                'Authorization': `Bearer ${user.matrixAccessToken}`,
              },
            }
          );

          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json();
            const events = messagesData.chunk || [];

            // Redact each message (only m.room.message events)
            for (const event of events) {
              if (event.type === 'm.room.message' && event.event_id) {
                try {
                  await fetch(
                    `${MATRIX_SERVER}/_matrix/client/v3/rooms/${encodeURIComponent(chat.matrixRoomId)}/redact/${encodeURIComponent(event.event_id)}/${Date.now()}`,
                    {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Bearer ${user.matrixAccessToken}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ reason: 'Chat cleared' }),
                    }
                  );
                } catch (err) {
                  console.error('Failed to redact event:', event.event_id, err);
                }
              }
            }
          }
        } catch (matrixErr) {
          console.error('Matrix redaction error:', matrixErr);
        }
      }

      // Сообщения теперь в Matrix, удаление происходит через Matrix API (выше)

      // Update chat last message
      await prisma.chat.update({
        where: { id: chatId },
        data: { lastMessage: null, lastMessageAt: null },
      });

      return NextResponse.json({ success: true, mode: 'all' });

    } else {
      // Delete only for me - mark as hidden for this user
      // We'll use a user-specific approach: store cleared timestamp
      await prisma.chatParticipant.updateMany({
        where: {
          chatId,
          userId: session.user.id,
        },
        data: {
          // Store the time when user cleared - messages before this time are hidden
          clearedAt: new Date(),
        },
      });

      // For old schema (participant1/participant2)
      const chatUpdate: any = {};
      const fullChat = await prisma.chat.findUnique({
        where: { id: chatId },
      });

      // Обновляем через ChatParticipant (уже обработано выше)

      if (Object.keys(chatUpdate).length > 0) {
        await prisma.chat.update({
          where: { id: chatId },
          data: chatUpdate,
        });
      }

      return NextResponse.json({ success: true, mode: 'me' });
    }

  } catch (error) {
    console.error('[chat/clear] Error:', error);
    return NextResponse.json({ error: 'Failed to clear chat' }, { status: 500 });
  }
}
