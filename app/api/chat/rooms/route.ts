import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateAIBotUser } from '@/lib/ai-assistant-bot';
import { getUserChats, getOrCreatePrivateChat, ChatInfo } from '@/lib/chat-service';
import * as Sentry from '@sentry/nextjs';

/**
 * GET /api/chat/rooms
 * Получить список чатов пользователя (совместимость с UI)
 * 
 * РЕФАКТОРИНГ: Теперь использует единый chat-service вместо дублирования логики
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Убеждаемся что у пользователя есть чат с AI ботом
    try {
      const botUser = await getOrCreateAIBotUser();
      await getOrCreatePrivateChat(session.user.id, botUser.id);
    } catch (err) {
      console.error('[chat/rooms] Error ensuring AI bot chat:', err);
    }

    // Используем единый сервис для получения чатов
    const chats = await getUserChats(session.user.id);

    // Преобразуем в формат, ожидаемый фронтендом
    const rooms = chats.map((chat: ChatInfo) => formatRoomForUI(chat, session.user.id));

    // Сортируем: AI чат первый, затем по времени последнего сообщения
    const sortedRooms = rooms.sort((a, b) => {
      const aIsBot = a.displayName?.includes('Помощник') || a.displayName?.includes('МойСоюз');
      const bIsBot = b.displayName?.includes('Помощник') || b.displayName?.includes('МойСоюз');
      if (aIsBot && !bIsBot) return -1;
      if (!aIsBot && bIsBot) return 1;
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });

    return NextResponse.json({ rooms: sortedRooms });
  } catch (error: any) {
    console.error('[chat/rooms] Error fetching chat rooms:', error);
    Sentry.captureException(error, {
      tags: { endpoint: 'GET /api/chat/rooms' },
      extra: { userId: session?.user?.id },
    });
    
    // Более информативное сообщение об ошибке
    const errorMessage = error?.message || 'Failed to fetch rooms';
    const statusCode = error?.statusCode || 500;
    
    return NextResponse.json(
      { 
        error: 'Ошибка при загрузке чатов',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: statusCode }
    );
  }
}

/**
 * Преобразует ChatInfo в формат для UI компонентов
 */
function formatRoomForUI(chat: ChatInfo, currentUserId: string) {
  const isDirect = chat.type === 'PRIVATE';
  const isTicketChat = chat.ticketId !== null || chat.name?.includes('Обращение #');
  
  // Определяем имя для отображения
  let displayName = chat.displayName;
  
  // Проверяем, является ли собеседник ботом
  const isBot = chat.otherUser?.firstName === 'AI' && chat.otherUser?.lastName === 'Помощник';
  if (isBot) {
    displayName = 'МойСоюз Помощник';
  }

  // Определяем аватар
  let avatarUrl: string | null = null;
  if (isBot) {
    avatarUrl = '/icon-512x512.png';
  } else if (chat.displayAvatar) {
    avatarUrl = chat.displayAvatar;
  } else if (isDirect && chat.otherUser?.avatarUrl) {
    avatarUrl = chat.otherUser.avatarUrl;
  } else if (chat.iconUrl) {
    avatarUrl = chat.iconUrl;
  }

  return {
    id: chat.id,
    chatId: chat.id,
    name: displayName || 'Без названия',
    displayName,
    type: chat.type,
    avatarUrl,
    isDirect,
    isGroup: chat.type === 'GROUP',
    isTicket: isTicketChat,
    ticketId: chat.ticketPublicId || null,
    ticketResolved: false, // TODO: получать из Ticket
    ticketStatus: null,
    isTicketCreator: false,
    participantCount: chat.participantsCount,
    lastMessage: chat.lastMessage ? {
      content: chat.lastMessage,
      createdAt: chat.lastMessageAt,
    } : null,
    lastMessageTime: chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : null,
    unreadCount: chat.unreadCount,
    participants: chat.participants.map(p => ({
      id: p.user?.id,
      firstName: p.user?.firstName,
      lastName: p.user?.lastName,
      avatarUrl: p.user?.avatarUrl,
    })),
  };
}
