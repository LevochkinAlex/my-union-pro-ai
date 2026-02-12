"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const UserCard = dynamic(() => import("@/components/dashboard/users/UserCard"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>
  ),
});

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  jobTitle: string | null;
  profession: string | null;
  createdAt: Date | string;
  organization: {
    id: string;
    name: string;
  } | null;
}

interface UsersListProps {
  users: User[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  observerTarget?: React.RefObject<HTMLDivElement>;
  isMobile?: boolean;
}

export default function UsersList({
  users,
  loading,
  loadingMore = false,
  hasMore = false,
  observerTarget,
  isMobile = false,
}: UsersListProps) {
  const [subscriptions, setSubscriptions] = useState<Record<string, boolean>>({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  // Загружаем статусы подписок пачкой при изменении списка пользователей
  const fetchBatchSubscriptions = useCallback(async (userIds: string[]) => {
    // Фильтруем только те ID, которые ещё не загружены
    const newIds = userIds.filter((id) => !fetchedIdsRef.current.has(id));
    if (newIds.length === 0) return;

    try {
      const response = await fetch("/api/subscriptions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: newIds }),
      });
      if (response.ok) {
        const data = await response.json();
        const batchResult: Record<string, boolean> = data.subscriptions || {};
        // Помечаем как загруженные
        for (const id of newIds) {
          fetchedIdsRef.current.add(id);
        }
        setSubscriptions((prev) => ({ ...prev, ...batchResult }));
      }
    } catch (error) {
      console.error("[UsersList] batch subscription check error:", error);
    }
  }, []);

  useEffect(() => {
    if (users.length > 0 && !loading) {
      const userIds = users.map((u) => u.id);
      fetchBatchSubscriptions(userIds);
    }
  }, [users, loading, fetchBatchSubscriptions]);

  // Обновить статус подписки для конкретного пользователя (после подписки/отписки)
  const handleSubscriptionChange = useCallback((userId: string, isSubscribed: boolean) => {
    setSubscriptions((prev) => ({ ...prev, [userId]: isSubscribed }));
  }, []);
  if (loading) {
    const skeletonCount = isMobile ? 4 : 6;
    return (
      <div className="space-y-4">
        {[...Array(skeletonCount)].map((_, i) => (
          <div
            key={i}
            className={`${
              isMobile
                ? "bg-gray-50 dark:bg-gray-900"
                : "bg-white dark:bg-gray-800"
            } rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse`}
          >
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div
        className={`${
          isMobile
            ? "bg-gray-50 dark:bg-gray-900"
            : "bg-white dark:bg-gray-800"
        } rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${
          isMobile ? "p-8" : "p-12"
        } text-center`}
      >
        <div className="flex flex-col items-center">
          <div
            className={`${
              isMobile ? "h-12 w-12" : "h-16 w-16"
            } rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center ${
              isMobile ? "mb-3" : "mb-4"
            }`}
          >
            <svg
              className={`${isMobile ? "h-6 w-6" : "h-8 w-8"} text-gray-400`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            Пользователи не найдены
          </p>
          <p
            className={`text-sm text-gray-400 dark:text-gray-500 ${
              isMobile ? "mt-1" : "mt-2"
            }`}
          >
            Попробуйте изменить параметры поиска
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={{
              ...user,
              createdAt:
                typeof user.createdAt === "string"
                  ? new Date(user.createdAt)
                  : user.createdAt,
            }}
            initialIsSubscribed={subscriptions[user.id] ?? null}
            onSubscriptionChange={handleSubscriptionChange}
          />
        ))}
      </div>

      {/* Индикатор загрузки при подгрузке */}
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Элемент для Intersection Observer (infinite scroll) */}
      {hasMore && !loadingMore && (
        <div ref={observerTarget} className="h-4" />
      )}

      {/* Сообщение, если больше нет пользователей */}
      {!hasMore && users.length > 0 && (
        <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
          Все пользователи загружены
        </div>
      )}
    </>
  );
}

