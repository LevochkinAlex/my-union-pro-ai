import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendUserNotification } from '@/lib/notifications';

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
      select: {
        id: true,
        name: true,
        type: true,
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
      console.log(`[chat/notify] ⚠️ Chat not found for matrixRoomId: ${roomId}`);
      // Try to find chat by searching all chats with this matrixRoomId for debugging
      const allChatsWithMatrix = await prisma.chat.findMany({
        where: { matrixRoomId: { not: null } },
        select: { id: true, matrixRoomId: true, type: true },
        take: 5
      });
      console.log(`[chat/notify] Available chats with matrixRoomId (sample):`, allChatsWithMatrix.map(c => ({ id: c.id, matrixRoomId: c.matrixRoomId?.substring(0, 20) + '...' })));
      return NextResponse.json({ ok: true, error: 'Chat not found' }); // No chat found, skip
    }
    
    console.log(`[chat/notify] ✅ Found chat ${chat.id} for matrixRoomId ${roomId}, participants: ${chat.participants.length}`);

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

    // Determine if it's a group chat
    const isGroupChat = chat.participants.length > 2;
    const chatName = chat.name || (isGroupChat ? 'Групповой чат' : null);
    
    // Prepare message preview (remove HTML tags if present)
    const messagePreview = message.replace(/<[^>]*>/g, '').slice(0, 100);
    
    // Build URL to chat
    const baseUrl = process.env.NEXTAUTH_URL || 'https://myunion.pro';
    const chatUrl = `/dashboard/chat${chat.id ? `?chatId=${chat.id}` : ''}`;

    // Send notifications to each recipient using sendUserNotification
    // This will create records in UserNotification table
    console.log(`[chat/notify] Sending notifications to ${recipients.length} recipients for chat ${chat.id}`);
    
    const results = await Promise.allSettled(
      recipients.map(userId =>
        sendUserNotification({
          userId,
          type: 'chat_message',
          title: isGroupChat 
            ? `${chatName || 'Групповой чат'}: ${senderName}`
            : `Новое сообщение от ${senderName}`,
          body: messagePreview,
          url: chatUrl,
          senderName,
        }).then((result) => {
          console.log(`[chat/notify] Notification sent to ${userId}:`, result);
          return result;
        }).catch((err) => {
          console.error(`[chat/notify] Error sending notification to ${userId}:`, err?.message || err);
          return { push: false, email: false };
        })
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[chat/notify] Notifications sent: ${successCount}/${recipients.length} successful`);

    return NextResponse.json({ ok: true, sent: successCount, total: recipients.length });
  } catch (error) {
    console.error('Error sending chat notification:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
