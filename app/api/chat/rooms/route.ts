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
  let session: any = null;
  try {
    session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Получаем viewMode пользователя для правильной фильтрации
    const { prisma } = await import('@/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        viewMode: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        isMPOHead: true,
        mpoHeadOrganizationId: true,
        isRPOHead: true,
        rpoHeadOrganizationId: true,
      },
    });

    const isMemberMode = user?.viewMode === "MEMBER";

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем тот же метод создания AI чата, что и /api/chat
    // чтобы избежать создания дублирующих чатов
    try {
      const { getOrCreateAIChat } = await import('@/app/api/chat/route');
      await getOrCreateAIChat(session.user.id);
    } catch (err) {
      console.error('[chat/rooms] Error ensuring AI bot chat:', err);
    }

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем те же фильтры, что и /api/chat
    // Для MEMBER mode обходим кэш для актуальных данных
    const chats = await getUserChats(session.user.id, {}, isMemberMode ? true : false);

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Применяем те же фильтры, что и /api/chat для MEMBER mode
    let filteredChats = chats;
    if (isMemberMode) {
      // Получаем ID своих обращений
      const userTickets = await prisma.ticket.findMany({
        where: { userId: session.user.id },
        select: { chatId: true },
      });
      const userTicketChatIds = userTickets
        .map(t => t.chatId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      filteredChats = chats.filter((chat: ChatInfo) => {
        if (!chat || !chat.id) return false;

        // Личные чаты - всегда показываем
        if (chat.type === "PRIVATE") return true;
        
        // Свои обращения - показываем
        if (chat.ticketId && userTicketChatIds.includes(chat.id)) return true;
        
        // Каналы - показываем только те, где пользователь участник
        if (chat.type === "CHANNEL") return true;
        
        // Групповые чаты (не обращения) - скрываем в режиме участника
        return false;
      });
    }

    // Преобразуем в формат, ожидаемый фронтендом
    const rooms = filteredChats.map((chat: ChatInfo) => formatRoomForUI(chat, session.user.id));

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Детальное логирование для диагностики
    const roomsWithUnread = rooms.filter(r => (r.unreadCount || 0) > 0);
    // Не считаем в бейдж непрочитанные из чатов бота/ИИ-Ассистент
    const roomsCountedForBadge = rooms.filter(r => !r.excludeFromUnreadBadge);
    const totalUnread = roomsCountedForBadge.reduce(
      (sum, r) => sum + Math.max(0, r.unreadCount || 0),
      0
    );
    console.log(`[chat/rooms] Returning rooms:`, {
      totalRooms: rooms.length,
      totalUnread,
      roomsWithUnreadCount: roomsWithUnread.length,
      roomsWithUnread: roomsWithUnread.map(r => ({
        id: r.id,
        name: r.name || r.displayName,
        unreadCount: r.unreadCount,
        type: r.type,
      })),
    });

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
    // Всегда возвращаем 200 с пустым списком, чтобы клиент не ретраил и UI не ломался
    return NextResponse.json({
      rooms: [],
      error: 'Ошибка при загрузке чатов',
      details: process.env.NODE_ENV === 'development' ? (error?.message || '') : undefined,
    });
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
  
  // Проверяем, является ли собеседник ботом (МойСоюз Помощник)
  const isBot = chat.otherUser?.firstName === 'AI' && chat.otherUser?.lastName === 'Помощник';
  if (isBot) {
    displayName = 'МойСоюз Помощник';
  }
  // Исключаем из бейджа непрочитанных: чаты с ботом, ИИ-Ассистент и Техподдержка
  const isBotOrAssistant =
    isBot ||
    (displayName || '').includes('ИИ-Ассистент') ||
    (chat.displayName || '').includes('ИИ-Ассистент') ||
    (chat.name || '').includes('ИИ-Ассистент') ||
    (displayName || '').includes('Техподдержка') ||
    (chat.displayName || '').includes('Техподдержка') ||
    (chat.name || '').includes('Техподдержка');

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
    excludeFromUnreadBadge: isBotOrAssistant,
    participants: chat.participants.map(p => ({
      id: p.user?.id,
      firstName: p.user?.firstName,
      lastName: p.user?.lastName,
      avatarUrl: p.user?.avatarUrl,
    })),
  };
}
