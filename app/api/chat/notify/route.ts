import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendUserNotification } from '@/lib/notifications';

/**
 * POST /api/chat/notify
 * Отправить push уведомление о новом сообщении в чате
 */
export async function POST(request: NextRequest) {
  try {
    // Проверяем внутренний токен (от WebSocket сервера)
    const internalToken = request.headers.get('X-Internal-Token');
    const isInternal = internalToken === process.env.INTERNAL_API_TOKEN;
    
    const body = await request.json();
    const { roomId, message, senderUserId: bodySenderUserId } = body;
    
    let senderUserId: string | null = null;
    
    if (isInternal) {
      // Внутренний вызов - получаем sender из body
      senderUserId = bodySenderUserId || null;
      if (!senderUserId) {
        return NextResponse.json({ error: 'Missing senderUserId for internal call' }, { status: 400 });
      }
    } else {
      // Обычный вызов - требуется сессия
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      senderUserId = session.user.id;
    }
    
    if (!roomId || !message) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    // Находим чат по ID
    const chat = await prisma.chat.findFirst({
      where: {
        id: roomId, // roomId теперь всегда chatId
      },
      select: {
        id: true,
        name: true,
        type: true,
        participants: {
          where: { leftAt: null },
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
      console.log(`[chat/notify] ⚠️ Chat not found for chatId: ${roomId}`);
      return NextResponse.json({ ok: true, error: 'Chat not found' });
    }
    
    console.log(`[chat/notify] ✅ Found chat ${chat.id}, participants: ${chat.participants.length}`);

    // Получаем информацию об отправителе
    const sender = await prisma.user.findUnique({
      where: { id: senderUserId },
      select: { firstName: true, lastName: true },
    });
    
    const senderName = [sender?.firstName, sender?.lastName]
      .filter(Boolean)
      .join(' ') || 'Пользователь';

    // Получаем получателей (все участники кроме отправителя)
    const recipients = chat.participants
      .filter(p => p.user?.id && p.user.id !== senderUserId)
      .map(p => p.user!.id);

    if (recipients.length === 0) {
      return NextResponse.json({ ok: true });
    }

    // Определяем, является ли это групповым чатом
    const isGroupChat = chat.participants.length > 2;
    const chatName = chat.name || (isGroupChat ? 'Групповой чат' : null);
    
    // Подготавливаем превью сообщения (убираем HTML теги если есть)
    const messagePreview = message.replace(/<[^>]*>/g, '').slice(0, 100);
    
    // Базовый URL
    const baseUrl = process.env.NEXTAUTH_URL || 'https://myunion.pro';

    console.log(`[chat/notify] Sending notifications to ${recipients.length} recipients for chat ${chat.id}`);
    
    // Получаем информацию о получателях для определения правильного URL
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
        // Определяем URL на основе роли получателя
        const recipientUser = recipientUsers.find(u => u.id === userId);
        const recipientIsPPOHead = recipientUser?.viewMode === 'PPO_HEAD' || 
          recipientUser?.role === 'PPO_HEAD' || 
          recipientUser?.isPPOHead;
        
        // Для групповых чатов или если получатель - Председатель, используем страницу чатов Председателя
        // Для личных чатов с обычными пользователями - обычную страницу чата
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
