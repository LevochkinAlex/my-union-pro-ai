"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import CloseAppealModal from "@/components/appeals/CloseAppealModal";
import { HorizontalTabArrowStrip } from "@/components/ui/HorizontalTabArrowStrip";

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
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  commentsCount: number;
  attachmentsCount?: number;
  lastCommentAt: string | null;
  chatId: string | null;
  rejectionReason: string | null;
  isOverdue?: boolean;
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

export default function PPOHeadAppealsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showForceCloseModal, setShowForceCloseModal] = useState(false);

  // Подсчёт по статусам
  const statusCounts = tickets.reduce((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    loadTickets();
  }, []);

  // Обновление списка при возврате на вкладку (например после закрытия обращения из чата)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadTickets();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const loadTickets = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/ppo-head/appeals", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data?.error as string) || "Ошибка загрузки обращений");
      }
      setTickets(data?.tickets ?? []);
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

  const handleReject = async (ticket: Ticket) => {
    if (!rejectionReason.trim()) {
      alertError("Укажите причину отклонения");
      return;
    }

    try {
      const response = await fetch(`/api/ppo-head/appeals/${ticket.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при отклонении обращения");
      }

      alertSuccess("Обращение отклонено");
      setShowRejectModal(false);
      setRejectionReason("");
      setSelectedTicket(null);
      await loadTickets();
    } catch (err) {
      console.error("Error rejecting ticket:", err);
      alertError(err instanceof Error ? err.message : "Не удалось отклонить обращение");
    }
  };

  const handleForceClose = async (reason: string) => {
    if (!selectedTicket) return;

    try {
      const id = selectedTicket.publicId.replace(/-/g, "");
      const response = await fetch(
        `/api/ppo-head/appeals/${id}/force-close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при закрытии обращения");
      }

      alertSuccess("Обращение закрыто");
      setShowForceCloseModal(false);
      setSelectedTicket(null);
      await loadTickets();
    } catch (err) {
      console.error("Error force closing ticket:", err);
      const errorMessage = err instanceof Error ? err.message : "Не удалось закрыть обращение";
      alertError(errorMessage);
      // Пробрасываем ошибку, чтобы модальное окно не закрывалось
      throw err;
    }
  };

  const getUserName = (user: Ticket["user"]) => {
    return [user.lastName, user.firstName].filter(Boolean).join(" ") || user.email || "Неизвестно";
  };

  const getUserInitials = (user: Ticket["user"]) => {
    const first = user.firstName?.[0] || "";
    const last = user.lastName?.[0] || "";
    return (first + last) || "?";
  };

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
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Обращения членов профсоюза
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Управление обращениями от членов вашей организации
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200 space-y-2">
          <p>{error}</p>
          {error === "Доступ запрещен или организация не назначена" && (
            <p className="mt-2">
              Если вы должны иметь доступ к разделу как председатель ППО, убедитесь, что вам назначена организация.{" "}
              <Link href="/dashboard/appeals?view=member" className="font-medium underline hover:no-underline">
                Перейти к моим обращениям
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <HorizontalTabArrowStrip enabled={!isLoading} remeasureDeps={[filter, tickets.length]}>
          {(innerRef) => (
        <nav ref={innerRef} className="-mb-px flex w-max max-w-none flex-nowrap gap-x-4 sm:gap-x-8">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`shrink-0 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
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
              type="button"
              onClick={() => setFilter(key as FilterStatus)}
              className={`shrink-0 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
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
          )}
        </HorizontalTabArrowStrip>
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
                className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-all hover:border-blue-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
              >
                {/* Аватар автора */}
                <div className="flex-shrink-0">
                  {ticket.user.avatarUrl ? (
                    <img
                      src={ticket.user.avatarUrl}
                      alt={getUserName(ticket.user)}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                      {getUserInitials(ticket.user)}
                    </div>
                  )}
                </div>

                {/* Основная информация */}
                <div 
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/dashboard/appeals/${ticket.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate text-sm">
                      {ticket.title}
                    </span>
                    <span className="flex-shrink-0 text-xs font-mono text-purple-600 dark:text-purple-400">
                      #{ticket.publicId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="truncate max-w-[120px]">{getUserName(ticket.user)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {typeInfo.icon}
                      {typeInfo.label}
                    </span>
                    <span>•</span>
                    <span>{formatDate(ticket.createdAt)}</span>
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

                {/* Статус и просрочка */}
                <div className="flex-shrink-0 flex items-center gap-1.5">
                  {ticket.isOverdue && ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      Просрочено
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusInfo.bgClass}`}>
                    {statusInfo.label}
                  </span>
                </div>

                {/* Действия */}
                <div className="flex-shrink-0 flex items-center gap-1">
                  {/* Кнопка чата */}
                  {ticket.chatId && (
                    <Link
                      href={`/dashboard/chat?chatId=${ticket.chatId}&ticketId=${ticket.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-8 h-8 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center hover:bg-green-500/20 transition-colors"
                      title="Открыть чат"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </Link>
                  )}

                  {/* Кнопка принудительного закрытия */}
                  {ticket.status !== "REJECTED" && ticket.status !== "CLOSED" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTicket(ticket);
                        setShowForceCloseModal(true);
                      }}
                      className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center hover:bg-orange-500/20 transition-colors"
                      title="Закрыть обращение"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {/* Кнопка отклонения */}
                  {ticket.status !== "REJECTED" && ticket.status !== "CLOSED" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTicket(ticket);
                        setShowRejectModal(true);
                      }}
                      className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                      title="Отклонить"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}

                  {/* Стрелка */}
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/appeals/${ticket.id}`)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    aria-label="Открыть обращение"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Force Close Modal */}
      {showForceCloseModal && selectedTicket && (
        <CloseAppealModal
          isOpen={showForceCloseModal}
          onClose={() => {
            setShowForceCloseModal(false);
            setSelectedTicket(null);
          }}
          onForceClose={handleForceClose}
          isForceClose={true}
          ticketId={selectedTicket.id}
          ticketPublicId={selectedTicket.publicId}
        />
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => {
            setShowRejectModal(false);
            setRejectionReason("");
            setSelectedTicket(null);
          }} />
          <div className="relative rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Отклонить обращение</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Укажите причину отклонения. Это сообщение будет отправлено автору.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white mb-4 focus:ring-2 focus:ring-red-500 outline-none"
              rows={4}
              placeholder="Причина отклонения..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleReject(selectedTicket)}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white font-medium hover:bg-red-700 transition-colors"
              >
                Отклонить
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason("");
                  setSelectedTicket(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium hover-surface dark:border-gray-600 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
