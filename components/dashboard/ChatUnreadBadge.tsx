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
      // Лёгкий endpoint: не тянем весь список комнат ради бейджа.
      const { fetchJsonWithRetry } = await import('@/lib/api-client');
      const data = await fetchJsonWithRetry<{ totalUnread?: number }>('/api/chat/unread-count');
      
      if (!data || typeof data.totalUnread !== 'number') {
        console.warn('[ChatUnreadBadge] No unread data received, setting count to 0');
        setUnreadCount(0);
        setIsInitialized(true);
        return;
      }

      const total = Math.max(0, Number(data.totalUnread) || 0);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChatUnreadBadge] FETCHED UNREAD COUNT:', total);
      }
      
      setUnreadCount(total);
      setIsInitialized(true);
    } catch (err) {
      console.error('[ChatUnreadBadge] Failed to fetch unread count:', err);
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
