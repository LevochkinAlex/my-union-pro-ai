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
        console.warn('[ChatUnreadBadge] No rooms data received');
        setUnreadCount(0);
        setIsInitialized(true);
        return;
      }
      
      const rooms = data.rooms || [];
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Суммируем только валидные unreadCount
      const total = rooms.reduce((sum: number, room: any) => {
        const count = typeof room.unreadCount === 'number' ? room.unreadCount : 0;
        // Игнорируем отрицательные значения
        return sum + Math.max(0, count);
      }, 0);
      
      console.log('[ChatUnreadBadge] Fetched unread count:', {
        total,
        roomsCount: rooms.length,
        roomsWithUnread: rooms.filter(r => (r.unreadCount || 0) > 0).length,
      });
      
      setUnreadCount(total);
      setIsInitialized(true);
    } catch (err) {
      console.error('[ChatUnreadBadge] Failed to fetch unread count:', err);
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При ошибке не сбрасываем счетчик, чтобы не показывать фейковую цифру
      // Просто не обновляем, оставляем последнее известное значение
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
      if (customEvent.detail?.count !== undefined) {
        setUnreadCount(customEvent.detail.count);
        setIsInitialized(true);
      }
    };
    
    const handleMessagesRead = (e?: Event) => {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: При прочтении сообщений обновляем счетчик немедленно
      const customEvent = e as CustomEvent;
      const chatId = customEvent?.detail?.chatId;
      console.log('[ChatUnreadBadge] Messages read event received:', { chatId });
      
      // Обновляем счетчик с небольшой задержкой, чтобы дать время серверу обновить readAt
      setTimeout(() => {
        fetchUnreadCount();
      }, 500);
    };
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Слушаем события изменения unreadCount из useChat
    const handleUnreadCountChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.totalUnread !== undefined) {
        const newCount = Math.max(0, customEvent.detail.totalUnread);
        console.log('[ChatUnreadBadge] Unread count changed via event:', newCount);
        setUnreadCount(newCount);
        setIsInitialized(true);
      }
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

  if (!isInitialized || unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
