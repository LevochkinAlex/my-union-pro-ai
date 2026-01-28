"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { fetchJsonWithRetry } from "@/lib/api-client";

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
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем fetchJsonWithRetry для обработки сетевых ошибок
      const data = await fetchJsonWithRetry<{
        statuses: Record<string, boolean>;
        lastSeenAt: Record<string, string | null>;
      }>(
        `/api/users/online-status?userIds=${validUserIds.join(",")}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
        {
          maxRetries: 2, // Меньше попыток для онлайн статуса (не критично)
          retryDelay: 500,
          retryableStatuses: [500, 502, 503, 504], // Повторяем только при серверных ошибках
        }
      );

      if (data) {
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
        // Если data null - значит была ошибка, но не ломаем UI
        console.warn("[useOnlineStatus] Failed to fetch statuses (data is null)");
        // Оставляем предыдущие статусы, не сбрасываем их
      }
    } catch (error) {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обрабатываем различные типы ошибок
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Игнорируем SSL ошибки и сетевые ошибки - они не критичны для онлайн статуса
      if (errorMessage.includes('SSL') || 
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('NetworkError') ||
          errorMessage.includes('handshake')) {
        console.warn("[useOnlineStatus] Network/SSL error (non-critical):", errorMessage);
        // Оставляем предыдущие статусы
      } else {
        console.error("[useOnlineStatus] Unexpected error:", error);
        // Оставляем предыдущие статусы
      }
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
