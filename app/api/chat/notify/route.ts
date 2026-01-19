import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendUserNotification } from '@/lib/notifications';

// POST /api/chat/notify - Send push notification for new chat message
export async function POST(request: NextRequest) {
  try {
    // Check for internal token (from Matrix bot or other services)
    const internalToken = request.headers.get('X-Internal-Token');
    const isInternal = internalToken === process.env.INTERNAL_API_TOKEN;
    
    // Parse request body once
    const body = await request.json();
    const { roomId, message, senderUserId: bodySenderUserId } = body;
    
    let senderUserId: string | null = null;
    
    if (isInternal) {
      // Internal call - get sender from request body
      senderUserId = bodySenderUserId || null;
      if (!senderUserId) {
        return NextResponse.json({ error: 'Missing senderUserId for internal call' }, { status: 400 });
      }
    } else {
      // Regular call - require session
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      senderUserId = session.user.id;
    }
    if (!roomId || !message) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    // Find chat by matrix room ID
    let chat = await prisma.chat.findFirst({
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

    // If chat not found by matrixRoomId, try to find it by participants
    // This can happen if matrixRoomId was set after the message was sent
    if (!chat) {
      console.log(`[chat/notify] ⚠️ Chat not found for matrixRoomId: ${roomId}, trying to find by participants`);
      
      // Try to find chat where sender is a participant
      // This is a fallback for cases where matrixRoomId is not yet set
      const chatsWithSender = await prisma.chat.findMany({
        where: {
          participants: {
            some: {
              userId: senderUserId,
              leftAt: null,
            }
          },
          type: 'PRIVATE', // Only for private chats
        },
        select: {
          id: true,
          name: true,
          type: true,
          matrixRoomId: true,
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
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 5, // Check recent chats
      });

      // Try to match by checking if any of these chats might have this matrixRoomId
      // or if it's a recent chat that might not have matrixRoomId set yet
      for (const candidateChat of chatsWithSender) {
        // If matrixRoomId is null, it might be a newly created chat
        // In this case, we'll use the most recent chat with the sender
        if (!candidateChat.matrixRoomId) {
          console.log(`[chat/notify] Found chat ${candidateChat.id} without matrixRoomId, using as fallback`);
          chat = candidateChat;
          break;
        }
      }

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
    }
    
    console.log(`[chat/notify] ✅ Found chat ${chat.id} for matrixRoomId ${roomId}, participants: ${chat.participants.length}`);

    // Get sender user info
    const sender = await prisma.user.findUnique({
      where: { id: senderUserId },
      select: { firstName: true, lastName: true },
    });
    
    const senderName = [sender?.firstName, sender?.lastName]
      .filter(Boolean)
      .join(' ') || 'Пользователь';

    // Get recipients (all participants except sender)
    const recipients = chat.participants
      .filter(p => p.user?.id && p.user.id !== senderUserId)
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
    // URL should be determined per recipient, not per sender
    const baseUrl = process.env.NEXTAUTH_URL || 'https://myunion.pro';

    // Send notifications to each recipient using sendUserNotification
    // This will create records in UserNotification table
    console.log(`[chat/notify] Sending notifications to ${recipients.length} recipients for chat ${chat.id}`);
    
    // Get recipient users to determine correct URL for each
    const recipientUsers = await prisma.user.findMany({
      where: { id: { in: recipients } },
      select: { 
        id: true, 
        viewMode: true, 
        role: true, 
        isPPOHead: true 
      },
    });

    const results = await Promise.allSettled(
      recipients.map(async (userId) => {
        // Determine URL based on recipient's role/viewMode
        const recipientUser = recipientUsers.find(u => u.id === userId);
        const recipientIsPPOHead = recipientUser?.viewMode === 'PPO_HEAD' || 
          recipientUser?.role === 'PPO_HEAD' || 
          recipientUser?.isPPOHead;
        
        // For group chats or if recipient is PPO_HEAD, use PPO head chat page
        // For private chats with regular users, use regular chat page
        // IMPORTANT: Use relative URL (without baseUrl) for Next.js router.push() to work correctly
        const chatUrl = (isGroupChat || recipientIsPPOHead) 
          ? `/dashboard/chats/ppo-head${chat.id ? `?chatId=${chat.id}` : ''}`
          : `/dashboard/chat${chat.id ? `?chatId=${chat.id}` : ''}`;

        return sendUserNotification({
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
        });
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[chat/notify] Notifications sent: ${successCount}/${recipients.length} successful`);

    return NextResponse.json({ ok: true, sent: successCount, total: recipients.length });
  } catch (error) {
    console.error('Error sending chat notification:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
