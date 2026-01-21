"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

/**
 * Хук для проверки онлайн статуса пользователей и времени последней активности
 */
export function useOnlineStatus(userIds: string[]) {
  const { data: session } = useSession();
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [lastSeenAt, setLastSeenAt] = useState<Record<string, Date | null>>({});
  const [loading, setLoading] = useState(true);

  const checkStatuses = useCallback(async () => {
    if (!userIds || userIds.length === 0) {
      setStatuses({});
      setLastSeenAt({});
      setLoading(false);
      return;
    }

    // Фильтруем валидные ID
    const validUserIds = userIds.filter(id => id && typeof id === 'string');
    if (validUserIds.length === 0) {
      setStatuses({});
      setLastSeenAt({});
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/users/online-status?userIds=${validUserIds.join(",")}`
      );
      if (response.ok) {
        const data = await response.json();
        setStatuses(data.statuses || {});
        // Преобразуем строки в Date объекты
        const lastSeen: Record<string, Date | null> = {};
        if (data.lastSeenAt) {
          Object.keys(data.lastSeenAt).forEach(userId => {
            lastSeen[userId] = data.lastSeenAt[userId] ? new Date(data.lastSeenAt[userId]) : null;
          });
        }
        setLastSeenAt(lastSeen);
      } else {
        // Если ошибка - просто игнорируем, не ломаем UI
        console.warn("[useOnlineStatus] Failed to fetch statuses:", response.status);
      }
    } catch (error) {
      console.error("[useOnlineStatus] Error:", error);
      // Не устанавливаем ошибку, просто оставляем пустой статус
    } finally {
      setLoading(false);
    }
  }, [userIds?.join(",") || ""]);

  useEffect(() => {
    checkStatuses();
    
    // Обновляем статусы каждые 30 секунд
    const interval = setInterval(checkStatuses, 30000);
    
    return () => clearInterval(interval);
  }, [checkStatuses]);

  const isOnline = useCallback((userId: string) => {
    return statuses[userId] ?? false;
  }, [statuses]);

  const getLastSeenAt = useCallback((userId: string): Date | null => {
    return lastSeenAt[userId] ?? null;
  }, [lastSeenAt]);

  return { statuses, isOnline, lastSeenAt, getLastSeenAt, loading };
}
