"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  metadata: any;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    loadNotifications();
  }, [filter]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/notifications?unreadOnly=${filter === "unread"}`
      );
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: [notificationId] }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllAsRead: true }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Помечаем как прочитанное
    if (!notification.readAt) {
      markAsRead(notification.id);
    }

    // Переходим по URL
    if (notification.url) {
      router.push(notification.url);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "chat_message":
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      case "news_published":
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        );
      case "post_comment":
      case "comment_reply":
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        );
      case "ticket_response":
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 0 ? "только что" : `${minutes} мин. назад`;
      }
      return `${hours} ч. назад`;
    } else if (days === 1) {
      return "вчера";
    } else if (days < 7) {
      return `${days} дн. назад`;
    } else {
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка уведомлений...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
        {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Уведомления
            </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {unreadCount > 0
              ? `${unreadCount} непрочитанных уведомлений`
              : "Все уведомления прочитаны"}
              </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 sm:px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap flex-shrink-0"
            >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Прочитать все</span>
            </button>
          )}
        </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 overflow-x-auto md:space-x-8">
          <button
            onClick={() => setFilter("all")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm ${
              filter === "all"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Все уведомления
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs font-medium md:py-4 md:text-sm flex items-center gap-2 ${
              filter === "unread"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Непрочитанные
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        </nav>
        </div>

        {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800 md:p-12">
            <svg
            className="mx-auto h-10 w-10 text-gray-400 md:h-12 md:w-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          <h3 className="mt-4 text-base font-medium text-gray-900 dark:text-white md:text-lg">
            {filter === "unread" ? "Нет непрочитанных уведомлений" : "Уведомлений пока нет"}
          </h3>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 md:text-sm">
            {filter === "unread"
              ? "Все уведомления прочитаны"
              : "Здесь будут появляться уведомления о новых событиях"}
            </p>
          </div>
        ) : (
        <div className="grid gap-3 sm:gap-4">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
              className={`rounded-lg border p-4 sm:p-5 cursor-pointer transition-all hover:shadow-md ${
                  notification.readAt
                  ? "bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700"
                  : "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                }`}
              >
              <div className="flex items-start gap-3 sm:gap-4">
                  <div
                  className={`flex-shrink-0 p-2 rounded-lg ${
                      notification.readAt
                      ? "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                      : "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
                    }`}
                  >
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                      className={`text-sm sm:text-base font-medium ${
                          notification.readAt
                            ? "text-gray-700 dark:text-gray-300"
                            : "text-gray-900 dark:text-white font-semibold"
                        }`}
                      >
                        {notification.title}
                      </h3>
                      {!notification.readAt && (
                      <div className="flex-shrink-0 w-2.5 h-2.5 bg-blue-600 rounded-full mt-1.5" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {notification.body}
                    </p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
