import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * DEBUG ENDPOINT: Показать все чаты пользователя и проверить их существование
 * GET /api/debug/user-chats
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`[debug/user-chats] ========== DEBUG USER CHATS ==========`);
    console.log(`[debug/user-chats] User: ${userId}`);

    // 1. Получаем все ChatParticipant записи для пользователя
    const participations = await prisma.chatParticipant.findMany({
      where: { 
        userId, 
        leftAt: null,
      },
      select: {
        chatId: true,
        role: true,
        joinedAt: true,
      },
    });

    console.log(`[debug/user-chats] User participates in ${participations.length} chats`);

    // 2. Проверяем каждый чат на существование
    const chatIds = participations.map(p => p.chatId);
    const existingChats = await prisma.chat.findMany({
      where: { id: { in: chatIds } },
      select: {
        id: true,
        type: true,
        name: true,
        createdAt: true,
        lastMessageAt: true,
        _count: { select: { messages: true, participants: true } },
      },
    });

    const existingChatIds = new Set(existingChats.map(c => c.id));
    
    // 3. Находим "призрачные" чаты (есть запись в ChatParticipant, но нет Chat)
    const ghostChats = participations.filter(p => !existingChatIds.has(p.chatId));
    
    console.log(`[debug/user-chats] Existing chats: ${existingChats.length}`);
    console.log(`[debug/user-chats] Ghost participations (chat deleted?): ${ghostChats.length}`);

    // 4. Получаем приватные чаты и их участников
    const privateChats = existingChats.filter(c => c.type === 'PRIVATE');
    const privateChatDetails = await Promise.all(
      privateChats.map(async (chat) => {
        const participants = await prisma.chatParticipant.findMany({
          where: { chatId: chat.id, leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });
        const otherParticipant = participants.find(p => p.userId !== userId);
        return {
          chatId: chat.id,
          chatName: chat.name,
          otherUser: otherParticipant?.user ? {
            id: otherParticipant.user.id,
            name: `${otherParticipant.user.firstName || ''} ${otherParticipant.user.lastName || ''}`.trim(),
          } : null,
          messagesCount: chat._count.messages,
          participantsCount: chat._count.participants,
          lastMessageAt: chat.lastMessageAt,
        };
      })
    );

    return NextResponse.json({
      debug: true,
      userId,
      summary: {
        totalParticipations: participations.length,
        existingChats: existingChats.length,
        ghostParticipations: ghostChats.length,
      },
      chats: existingChats.map(c => ({
        id: c.id,
        type: c.type,
        name: c.name,
        messagesCount: c._count.messages,
        participantsCount: c._count.participants,
        lastMessageAt: c.lastMessageAt,
      })),
      privateChats: privateChatDetails,
      ghostParticipations: ghostChats.map(g => ({
        chatId: g.chatId,
        role: g.role,
        joinedAt: g.joinedAt,
        note: 'This chat was deleted but participation record remains',
      })),
    });
  } catch (error: any) {
    console.error('[debug/user-chats] Error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
