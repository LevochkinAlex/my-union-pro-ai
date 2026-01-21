"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

/**
 * Хук для проверки онлайн статуса пользователей
 */
export function useOnlineStatus(userIds: string[]) {
  const { data: session } = useSession();
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const checkStatuses = useCallback(async () => {
    if (!userIds || userIds.length === 0) {
      setStatuses({});
      setLoading(false);
      return;
    }

    // Фильтруем валидные ID
    const validUserIds = userIds.filter(id => id && typeof id === 'string');
    if (validUserIds.length === 0) {
      setStatuses({});
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

  return { statuses, isOnline, loading };
}
