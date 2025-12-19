"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PPOHeadAppealsPage from "./ppo-head/page";

interface Ticket {
  id: string;
  publicId: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachmentsCount: number;
  commentsCount: number;
  lastCommentAt: string | null;
  chatId: string | null;
}

const TICKET_TYPES: Record<string, { label: string; icon: React.ReactNode }> = {
  LEGAL: { 
    label: "Юридическое", 
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
  },
  ACCOUNTING: { 
    label: "Бухгалтерия", 
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
  },
  TECHNICAL: { 
    label: "Техподдержка", 
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  },
  HR: { 
    label: "Кадры", 
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
  },
  OTHER: { 
    label: "Прочее", 
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  },
};

const TICKET_STATUSES: Record<string, { label: string; color: string; bgClass: string }> = {
  PENDING: { label: "Ожидание", color: "yellow", bgClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  IN_PROGRESS: { label: "В работе", color: "blue", bgClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  RESOLVED: { label: "Решено", color: "green", bgClass: "bg-green-500/10 text-green-600 dark:text-green-400" },
  REJECTED: { label: "Отклонено", color: "red", bgClass: "bg-red-500/10 text-red-600 dark:text-red-400" },
  CLOSED: { label: "Закрыто", color: "gray", bgClass: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
};

const PRIORITY_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  LOW: { 
    icon: <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>,
    color: "text-gray-400"
  },
  MEDIUM: { 
    icon: <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>,
    color: "text-blue-500"
  },
  HIGH: { 
    icon: <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>,
    color: "text-orange-500"
  },
  URGENT: { 
    icon: <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" transform="rotate(180 10 10)" /></svg>,
    color: "text-red-500"
  },
};

type FilterStatus = "all" | keyof typeof TICKET_STATUSES;

export default function AppealsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Все хуки должны быть объявлены ДО любых условных return
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");

  // Если пользователь - Председатель (по роли, флагу isPPOHead или viewMode), показываем специальную страницу
  const isPPOHead = 
    session?.user?.role === "PPO_HEAD" || 
    (session?.user as any)?.isPPOHead === true ||
    (session?.user as any)?.viewMode === "PPO_HEAD";

  // Подсчёт по статусам
  const statusCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    // Загружаем обращения только если не PPO_HEAD
    if (!isPPOHead && status === "authenticated") {
      loadTickets();
    }
  }, [isPPOHead, status]);

  // Если пользователь - Председатель, показываем специальную страницу
  if (isPPOHead) {
    return <PPOHeadAppealsPage />;
  }
  
  // Показываем загрузку пока сессия грузится
  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  const loadTickets = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/tickets");
      if (!response.ok) {
        throw new Error("Ошибка загрузки обращений");
      }

      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error("Error loading tickets:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить обращения");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTickets = filter === "all" 
    ? tickets 
    : tickets.filter(t => t.status === filter);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка обращений...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Мои обращения</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Отслеживайте статус ваших обращений к профсоюзу
          </p>
        </div>
        <Link
          href="/dashboard/appeals/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Создать обращение
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
              filter === "all"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Все
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              filter === "all" 
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            }`}>
              {tickets.length}
            </span>
          </button>
          {Object.entries(TICKET_STATUSES).map(([key, value]) => (
            <button
              key={key}
              onClick={() => setFilter(key as FilterStatus)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
                filter === key
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              {value.label}
              {(statusCounts[key] || 0) > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  filter === key 
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                }`}>
                  {statusCounts[key]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Список обращений */}
      {filteredTickets.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
            {filter === "all" ? "Обращений пока нет" : "Нет обращений в этом статусе"}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Создайте новое обращение, чтобы получить помощь
          </p>
          {filter === "all" && (
            <Link
              href="/dashboard/appeals/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Создать обращение
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => {
            const typeInfo = TICKET_TYPES[ticket.type] || TICKET_TYPES.OTHER;
            const statusInfo = TICKET_STATUSES[ticket.status] || TICKET_STATUSES.PENDING;
            const priorityInfo = PRIORITY_ICONS[ticket.priority] || PRIORITY_ICONS.MEDIUM;
            
            return (
              <div
                key={ticket.id}
                onClick={() => router.push(`/dashboard/appeals/${ticket.id}`)}
                className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 cursor-pointer transition-all hover:border-blue-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
              >
                {/* Иконка типа */}
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                  {typeInfo.icon}
                </div>

                {/* Основная информация */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate text-sm">
                      {ticket.title}
                    </span>
                    <span className="flex-shrink-0 text-xs font-mono text-purple-600 dark:text-purple-400">
                      #{ticket.publicId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      {typeInfo.label}
                    </span>
                    <span>•</span>
                    <span>{formatDate(ticket.createdAt)}</span>
                    {ticket.attachmentsCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1" title="Вложения">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {ticket.attachmentsCount}
                        </span>
                      </>
                    )}
                    {ticket.commentsCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1" title="Комментарии">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          {ticket.commentsCount}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Приоритет */}
                <div className={`flex-shrink-0 ${priorityInfo.color}`} title={`Приоритет: ${ticket.priority}`}>
                  {priorityInfo.icon}
                </div>

                {/* Статус */}
                <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium ${statusInfo.bgClass}`}>
                  {statusInfo.label}
                </div>

                {/* Кнопка чата */}
                {ticket.chatId && (
                  <Link
                    href={`/dashboard/chat?chatId=${ticket.chatId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center hover:bg-green-500/20 transition-colors"
                    title="Открыть чат"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Link>
                )}

                {/* Стрелка */}
                <svg className="flex-shrink-0 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
