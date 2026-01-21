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
      const response = await fetch('/api/chat/rooms');
      if (!response.ok) return;
      
      const data = await response.json();
      const rooms = data.rooms || [];
      
      // Суммируем непрочитанные сообщения по всем чатам
      const total = rooms.reduce((sum: number, room: any) => {
        return sum + (room.unreadCount || 0);
      }, 0);
      
      setUnreadCount(total);
      setIsInitialized(true);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
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
    
    const handleMessagesRead = () => {
      // При прочтении сообщений обновляем счетчик
      setTimeout(fetchUnreadCount, 1000);
    };
    
    window.addEventListener('chat-unread-updated', handleUnreadUpdate);
    window.addEventListener('chat-messages-read', handleMessagesRead);
    
    return () => {
      window.removeEventListener('chat-unread-updated', handleUnreadUpdate);
      window.removeEventListener('chat-messages-read', handleMessagesRead);
    };
  }, [fetchUnreadCount]);

  if (!isInitialized || unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-red-500 text-white rounded-full flex items-center justify-center">
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
