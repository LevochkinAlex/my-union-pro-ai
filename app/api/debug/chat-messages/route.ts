import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * DEBUG ENDPOINT: Проверка сообщений в чате напрямую из БД
 * GET /api/debug/chat-messages?chatId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'chatId required' }, { status: 400 });
    }

    console.log(`[debug/chat-messages] ========== DEBUG CHECK ==========`);
    console.log(`[debug/chat-messages] Checking chat: ${chatId}`);
    console.log(`[debug/chat-messages] User: ${session.user.id}`);

    // 1. Проверяем существует ли чат
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        type: true,
        name: true,
        createdAt: true,
        lastMessageId: true,
        lastMessageAt: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ 
        error: 'Chat not found',
        chatId,
      }, { status: 404 });
    }

    console.log(`[debug/chat-messages] Chat found:`, chat);

    // 2. Проверяем участников
    const participants = await prisma.chatParticipant.findMany({
      where: { chatId, leftAt: null },
      select: { userId: true, role: true },
    });

    console.log(`[debug/chat-messages] Participants (${participants.length}):`, participants);

    // 3. Проверяем является ли пользователь участником
    const isParticipant = participants.some(p => p.userId === session.user.id);
    console.log(`[debug/chat-messages] User is participant: ${isParticipant}`);

    // 4. Получаем ВСЕ сообщения в чате (без фильтров)
    const allMessages = await prisma.chatMessage.findMany({
      where: { chatId },
      select: {
        id: true,
        chatId: true,
        senderId: true,
        content: true,
        messageType: true,
        threadRootId: true,
        replyToId: true,
        createdAt: true,
        _count: { select: { attachments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    console.log(`[debug/chat-messages] Total messages in chat: ${allMessages.length}`);

    // 5. Проверяем сколько root messages (threadRootId = null)
    const rootMessages = allMessages.filter(m => m.threadRootId === null);
    console.log(`[debug/chat-messages] Root messages (threadRootId = null): ${rootMessages.length}`);

    // 6. Проверяем сколько thread messages
    const threadMessages = allMessages.filter(m => m.threadRootId !== null);
    console.log(`[debug/chat-messages] Thread messages (threadRootId != null): ${threadMessages.length}`);

    // 7. Если это чат обращения, проверяем ticket
    const ticket = await prisma.ticket.findFirst({
      where: { chatId },
      select: {
        id: true,
        publicId: true,
        title: true,
        userId: true,
        status: true,
      },
    });

    if (ticket) {
      console.log(`[debug/chat-messages] This is a ticket chat:`, ticket);
    }

    return NextResponse.json({
      debug: true,
      chatId,
      userId: session.user.id,
      isParticipant,
      chat: {
        ...chat,
        participantsCount: participants.length,
      },
      participants,
      ticket: ticket || null,
      messages: {
        total: allMessages.length,
        rootMessages: rootMessages.length,
        threadMessages: threadMessages.length,
        list: allMessages.map(m => ({
          id: m.id,
          senderId: m.senderId,
          contentPreview: m.content?.substring(0, 50) + (m.content?.length > 50 ? '...' : ''),
          messageType: m.messageType,
          threadRootId: m.threadRootId,
          replyToId: m.replyToId,
          attachmentsCount: m._count.attachments,
          createdAt: m.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error('[debug/chat-messages] Error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
