import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateAIBotUser } from '@/lib/ai-assistant-bot';
import { getOrCreatePrivateChat } from '@/lib/chat-service';

// GET /api/chat/rooms - Get user's chats with proper names
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Убеждаемся что у пользователя есть чат с ИИ ботом
    let botUser = null;
    try {
      botUser = await getOrCreateAIBotUser();
      await getOrCreatePrivateChat(session.user.id, botUser.id);
    } catch (err) {
      console.error('[chat/rooms] Error ensuring AI bot chat:', err);
      // Не блокируем основной запрос если не удалось создать чат с ботом
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
        createdAt: true,
        updatedAt: true,
        // lastMessageId и lastMessage могут не существовать до миграции
        // Используем try-catch или проверяем существование колонок
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
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Format response
    // Получаем информацию о тикетах для чатов
    const chatIds = chats.map(c => c.id);
    
    const tickets = chatIds.length > 0 ? await prisma.ticket.findMany({
      where: { 
        matrixRoomId: { in: chats.filter(c => c.matrixRoomId).map(c => c.matrixRoomId!) },
      },
      select: { 
        id: true,
        matrixRoomId: true,
        publicId: true,
        status: true,
        resolved: true,
        userId: true,
      },
    }) : [];
    
    const ticketMap = new Map<string, typeof tickets[0]>();
    tickets.forEach(t => {
      if (t.chatId) ticketMap.set(t.chatId, t);
      if (t.matrixRoomId) {
        const chat = chats.find(c => c.matrixRoomId === t.matrixRoomId);
        if (chat) ticketMap.set(chat.id, t);
      }
    });

    const roomsData = chats
      .map(chat => {
        // Получаем тикет
        const ticket = ticketMap.get(chat.id) || null;
        const isDirect = chat.participants.length === 2;
        
        // Get the other participant for DM chats
        const otherParticipant = chat.participants.find(
          p => p.user?.id !== session.user.id
        )?.user;
        
        // Determine display name
        let displayName = '';
        // For ticket chats, use the chat name (e.g., "Обращение #12345")
        // Проверяем, является ли это чатом обращения по matrixRoomId
        const isTicketChat = chat.name?.includes('Обращение #');
        if (isTicketChat && chat.name) {
          displayName = chat.name;
        } else if (chat.type === 'GROUP' && chat.name) {
          // For groups with explicit names
          displayName = chat.name;
        } else if (isDirect && otherParticipant) {
          // Check if it's AI bot (by id, matrixUserId, or name)
          const isBot = (botUser && otherParticipant.id === botUser.id) ||
                        otherParticipant.matrixUserId?.includes('ai_assistant') || 
                        otherParticipant.matrixUserId?.includes('myunion_bot') ||
                        otherParticipant.matrixUserId?.includes('assistant') ||
                        (otherParticipant.firstName === 'AI' && (otherParticipant.lastName === 'Помощник' || otherParticipant.lastName?.includes('Помощник')));
          if (isBot) {
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
        const isBotAvatar = (botUser && otherParticipant?.id === botUser.id) ||
                            otherParticipant?.matrixUserId?.includes('myunion_bot') || 
                            otherParticipant?.matrixUserId?.includes('ai_assistant') ||
                            (otherParticipant?.firstName === 'AI' && otherParticipant?.lastName === 'Помощник');
        
        if (isBotAvatar) {
          avatarUrl = '/icon-512x512.png'; // Используем иконку ИИ
        } else if (isDirect && otherParticipant?.avatarUrl) {
          avatarUrl = otherParticipant.avatarUrl;
        } else if (chat.type === 'GROUP' && chat.iconUrl) {
          avatarUrl = chat.iconUrl;
        }
        
        return {
          chatId: chat.id, // Добавляем chatId для нового API
          matrixRoomId: chat.matrixRoomId, // Оставляем для обратной совместимости
          displayName,
          avatarUrl,
          isDirect,
          isGroup: chat.type === 'GROUP',
          isTicket: !!ticket, // true if this chat is linked to a ticket
          ticketId: ticket?.publicId || null,
          ticketResolved: ticket?.resolved || false,
          ticketStatus: ticket?.status || null,
          isTicketCreator: ticket?.userId === session.user.id, // Is current user the ticket creator
          participantCount: chat.participants.length,
          lastMessage: null, // Будет загружаться отдельно если нужно
          lastMessageTime: null, // Будет загружаться отдельно если нужно
          threadRepliesCount: 0,
          participants: chat.participants.map(p => ({
            id: p.user?.id,
            firstName: p.user?.firstName,
            lastName: p.user?.lastName,
            avatarUrl: p.user?.avatarUrl,
            matrixUserId: p.user?.matrixUserId
          }))
        };
      });

    // Сортируем комнаты: сначала чат с ИИ, затем по времени последнего сообщения
    const sortedRooms = roomsData.sort((a, b) => {
      // Чат с ИИ всегда первый
      const aIsBot = a.displayName?.includes('Помощник') || a.displayName?.includes('AI') || a.displayName?.includes('Бот');
      const bIsBot = b.displayName?.includes('Помощник') || b.displayName?.includes('AI') || b.displayName?.includes('Бот');
      
      if (aIsBot && !bIsBot) return -1;
      if (!aIsBot && bIsBot) return 1;
      
      // Остальные сортируем по времени последнего сообщения
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });

    return NextResponse.json({ rooms: sortedRooms });
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
  }
}
