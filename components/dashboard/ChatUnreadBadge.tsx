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
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChatUnreadBadge] FETCHED UNREAD COUNT:', total, '| rooms:', roomsForBadge.length, '| with unread:', roomsWithUnread.length);
      }
      
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

  // Слушаем события обновления (подписка один раз при монтировании, чтобы не пропустить событие)
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

    const handleMessagesRead = () => {
      setTimeout(() => fetchUnreadCount(), 1500);
    };

    const handleUnreadCountChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.totalUnread === undefined) return;
      const newCount = Math.max(0, Number(customEvent.detail.totalUnread));
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

  // Показываем бейдж, если есть непрочитанные (индекс показываем всегда при unreadCount > 0)
  if (unreadCount <= 0) return null;

  return (
    <span
      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center"
      aria-label={`Непрочитанных сообщений: ${unreadCount}`}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
