"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";

export default function ChatUnreadBadge() {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    if (!session?.user?.id) return;
    
    try {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем fetchJsonWithRetry для обработки сетевых ошибок
      const { fetchJsonWithRetry } = await import('@/lib/api-client');
      const data = await fetchJsonWithRetry<{ rooms: any[] }>('/api/chat/rooms');
      
      if (!data || !data.rooms) {
        console.warn('[ChatUnreadBadge] No rooms data received, setting count to 0');
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При ошибке сбрасываем счетчик в 0, чтобы не показывать фейковую цифру
        setUnreadCount(0);
        setIsInitialized(true);
        return;
      }
      
      const rooms = data.rooms || [];
      // Не учитываем в бейдже чаты бота и ИИ-Ассистент (МойСоюз Помощник, ИИ-Ассистент)
      const roomsForBadge = rooms.filter((r: any) => !r.excludeFromUnreadBadge);
      
      const roomsWithUnread = roomsForBadge.filter((r: any) => {
        const count = typeof r.unreadCount === 'number' ? r.unreadCount : 0;
        return count > 0;
      });
      
      const total = roomsWithUnread.reduce((sum: number, room: any) => {
        const count = typeof room.unreadCount === 'number' ? room.unreadCount : 0;
        return sum + Math.max(0, count);
      }, 0);
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Детальное логирование для диагностики
      console.log('[ChatUnreadBadge] ========== FETCHED UNREAD COUNT ==========');
      console.log('[ChatUnreadBadge] Total unread (excl. bot/assistant):', total);
      console.log('[ChatUnreadBadge] Rooms count:', rooms.length, '| for badge:', roomsForBadge.length);
      console.log('[ChatUnreadBadge] Rooms with unread:', roomsWithUnread.length);
      console.log('[ChatUnreadBadge] Rooms with unread details:', JSON.stringify(roomsWithUnread.map(r => ({
        id: r.id,
        name: r.name || r.displayName,
        unreadCount: r.unreadCount,
        type: r.type,
        isDirect: r.isDirect,
        isGroup: r.isGroup,
        isTicket: r.isTicket,
      })), null, 2));
      console.log('[ChatUnreadBadge] ALL ROOMS:', JSON.stringify(rooms.map(r => ({
        id: r.id,
        name: r.name || r.displayName,
        unreadCount: r.unreadCount || 0,
        type: r.type,
      })), null, 2));
      console.log('[ChatUnreadBadge] ==========================================');
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Всегда обновляем счетчик, даже если он 0
      setUnreadCount(total);
      setIsInitialized(true);
    } catch (err) {
      console.error('[ChatUnreadBadge] Failed to fetch unread count:', err);
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При ошибке сбрасываем счетчик в 0, чтобы не показывать фейковую цифру
      setUnreadCount(0);
      setIsInitialized(true);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    // Начальная загрузка
    fetchUnreadCount();
    
    // Обновление каждые 30 секунд
    const interval = setInterval(fetchUnreadCount, 30000);
    
    return () => clearInterval(interval);
  }, [session, fetchUnreadCount]);

  // Слушаем события обновления
  useEffect(() => {
    const handleUnreadUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.count === undefined) return;
      const count = customEvent.detail.count;
      queueMicrotask(() => {
        setUnreadCount(count);
        setIsInitialized(true);
      });
    };
    
    const handleMessagesRead = (e?: Event) => {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При прочтении сообщений обновляем счетчик немедленно
      const customEvent = e as CustomEvent;
      const chatId = customEvent?.detail?.chatId;
      console.log('[ChatUnreadBadge] Messages read event received:', { chatId });
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обновляем счетчик с задержкой, чтобы дать время серверу обновить readAt и перезагрузить чаты
      setTimeout(() => {
        console.log('[ChatUnreadBadge] Fetching unread count after messages read');
        fetchUnreadCount();
      }, 1500); // Увеличена задержка для синхронизации с перезагрузкой чатов
    };
    
    // Слушаем события изменения unreadCount из useChat.
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Откладываем setState в очередь, чтобы не обновлять
    // ChatUnreadBadge во время рендера другого компонента (SlackStyleChat) — иначе
    // "Cannot update a component while rendering a different component".
    const handleUnreadCountChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.totalUnread === undefined) return;
      const newCount = Math.max(0, customEvent.detail.totalUnread);
      const oldCount = unreadCount;
      console.log('[ChatUnreadBadge] Unread count changed via event:', {
        oldCount,
        newCount,
        difference: newCount - oldCount,
        eventDetail: customEvent.detail,
      });
      queueMicrotask(() => {
        setUnreadCount(newCount);
        setIsInitialized(true);
      });
    };
    
    window.addEventListener('chat-unread-updated', handleUnreadUpdate);
    window.addEventListener('chat-messages-read', handleMessagesRead);
    window.addEventListener('chat-unread-count-changed', handleUnreadCountChange);
    
    return () => {
      window.removeEventListener('chat-unread-updated', handleUnreadUpdate);
      window.removeEventListener('chat-messages-read', handleMessagesRead);
      window.removeEventListener('chat-unread-count-changed', handleUnreadCountChange);
    };
  }, [fetchUnreadCount]);

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Показываем бейдж только если есть непрочитанные и компонент инициализирован
  if (!isInitialized) return null;
  if (unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
