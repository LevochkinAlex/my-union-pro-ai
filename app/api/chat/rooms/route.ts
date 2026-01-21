import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateAIBotUser } from '@/lib/ai-assistant-bot';
import { getOrCreatePrivateChat } from '@/lib/chat-service';

/**
 * GET /api/chat/rooms
 * Получить список чатов пользователя
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Убеждаемся что у пользователя есть чат с ИИ ботом
    try {
      const botUser = await getOrCreateAIBotUser();
      await getOrCreatePrivateChat(session.user.id, botUser.id);
    } catch (err) {
      console.error('[chat/rooms] Error ensuring AI bot chat:', err);
    }

    // Получаем чаты пользователя
    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: session.user.id,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
        type: true,
        name: true,
        iconUrl: true,
        createdAt: true,
        updatedAt: true,
        lastMessageId: true,
        lastMessageAt: true,
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
        lastMessage: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    // Получаем тикеты для чатов
    const ticketPublicIds: string[] = [];
    chats.forEach(chat => {
      if (chat.name?.includes('Обращение #')) {
        const match = chat.name.match(/#(\d{8})/);
        if (match) ticketPublicIds.push(match[1]);
      }
    });

    const tickets = ticketPublicIds.length > 0
      ? await prisma.ticket.findMany({
          where: { publicId: { in: ticketPublicIds } },
          select: {
            id: true,
            publicId: true,
            status: true,
            resolved: true,
            userId: true,
            chatId: true,
          },
        })
      : [];

    const ticketMap = new Map<string, typeof tickets[0]>();
    tickets.forEach(t => {
      if (t.chatId) {
        ticketMap.set(t.chatId, t);
      }
    });

    // Форматируем ответ
    const rooms = chats.map(chat => {
      const ticket = ticketMap.get(chat.id) || null;
      const isDirect = chat.participants.length === 2;
      const otherParticipant = chat.participants.find(
        p => p.user?.id !== session.user.id
      )?.user;

      // Определяем имя
      let displayName = '';
      const isTicketChat = chat.name?.includes('Обращение #') || ticket !== null;
      
      if (isTicketChat && chat.name) {
        displayName = chat.name;
      } else if (chat.type === 'GROUP' && chat.name) {
        displayName = chat.name;
      } else if (isDirect && otherParticipant) {
        const botUser = otherParticipant.firstName === 'AI' && otherParticipant.lastName === 'Помощник';
        displayName = botUser
          ? 'МойСоюз Помощник'
          : [otherParticipant.firstName, otherParticipant.lastName]
              .filter(Boolean)
              .join(' ') || 'Пользователь';
      } else {
        displayName = chat.participants
          .filter(p => p.user?.id !== session.user.id)
          .map(p => p.user?.firstName)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ') || 'Групповой чат';
      }

      // Аватар
      let avatarUrl: string | null = null;
      const isBot = otherParticipant?.firstName === 'AI' && otherParticipant?.lastName === 'Помощник';
      
      if (isBot) {
        avatarUrl = '/icon-512x512.png';
      } else if (isDirect && otherParticipant?.avatarUrl) {
        avatarUrl = otherParticipant.avatarUrl;
      } else if (chat.type === 'GROUP' && chat.iconUrl) {
        avatarUrl = chat.iconUrl;
      }

      // Непрочитанные сообщения
      const participant = chat.participants.find(p => p.userId === session.user.id);
      const unreadCount = 0; // TODO: Реализовать подсчет непрочитанных

      return {
        id: chat.id,
        chatId: chat.id,
        name: displayName || 'Без названия',
        displayName,
        type: chat.type,
        avatarUrl,
        isDirect,
        isGroup: chat.type === 'GROUP',
        isTicket: !!ticket,
        ticketId: ticket?.publicId || null,
        ticketResolved: ticket?.resolved || false,
        ticketStatus: ticket?.status || null,
        isTicketCreator: ticket?.userId === session.user.id,
        participantCount: chat.participants.length,
        lastMessage: chat.lastMessage ? {
          content: chat.lastMessage.content,
          createdAt: chat.lastMessage.createdAt,
        } : null,
        lastMessageTime: chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : null,
        unreadCount,
        participants: chat.participants.map(p => ({
          id: p.user?.id,
          firstName: p.user?.firstName,
          lastName: p.user?.lastName,
          avatarUrl: p.user?.avatarUrl,
        })),
      };
    });

    // Сортируем: AI чат первый
    const sortedRooms = rooms.sort((a, b) => {
      const aIsBot = a.displayName?.includes('Помощник');
      const bIsBot = b.displayName?.includes('Помощник');
      if (aIsBot && !bIsBot) return -1;
      if (!aIsBot && bIsBot) return 1;
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });

    return NextResponse.json({ rooms: sortedRooms });
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
  }
}
