"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { alertSuccess, alertError, confirm } from "@/lib/alert";

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
  };
  commentsCount: number;
  lastCommentAt: string | null;
  chatId: string | null;
  rejectionReason: string | null;
}

const TICKET_TYPES = {
  LEGAL: "Юридическое обращение",
  ACCOUNTING: "Бухгалтерское обращение",
  TECHNICAL: "Техническая поддержка",
  HR: "Кадровые вопросы",
  OTHER: "Прочее",
};

const TICKET_STATUSES = {
  PENDING: { label: "Ожидание", color: "yellow" },
  IN_PROGRESS: { label: "В работе", color: "blue" },
  RESOLVED: { label: "Решено", color: "green" },
  REJECTED: { label: "Отклонено", color: "red" },
  CLOSED: { label: "Закрыто", color: "gray" },
};

export default function PPOHeadAppealsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | keyof typeof TICKET_STATUSES>("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    loadTickets();
  }, [filter]);

  const loadTickets = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = filter === "all" ? "/api/ppo-head/appeals" : `/api/ppo-head/appeals?status=${filter}`;
      const response = await fetch(url);
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

  const handleDelete = async (ticketId: string) => {
    const confirmed = await confirm(
      "Вы уверены, что хотите удалить это обращение?",
      "Подтвердите удаление"
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/ppo-head/appeals/${ticketId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при удалении обращения");
      }

      alertSuccess("Обращение удалено");
      await loadTickets();
    } catch (err) {
      console.error("Error deleting ticket:", err);
      alertError(err instanceof Error ? err.message : "Не удалось удалить обращение");
    }
  };

  const getStatusColor = (status: string) => {
    const statusInfo = TICKET_STATUSES[status as keyof typeof TICKET_STATUSES];
    const colorMap = {
      yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      gray: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };
    return colorMap[statusInfo?.color || "gray"] || colorMap.gray;
  };

  const getUserName = (user: Ticket["user"]) => {
    return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ") || user.email || "Неизвестно";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Обращения членов профсоюза
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Управление обращениями от членов вашей организации
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === "all"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
          }`}
        >
          Все
        </button>
        {Object.entries(TICKET_STATUSES).map(([key, value]) => (
          <button
            key={key}
            onClick={() => setFilter(key as keyof typeof TICKET_STATUSES)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === key
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            {value.label}
          </button>
        ))}
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-600 dark:text-gray-400">
            Обращений не найдено
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {ticket.title}
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30">
                      #{ticket.publicId}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {TICKET_STATUSES[ticket.status as keyof typeof TICKET_STATUSES]?.label || ticket.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    От: {getUserName(ticket.user)}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Тип: {TICKET_TYPES[ticket.type as keyof typeof TICKET_TYPES] || ticket.type}
                  </p>
                  {ticket.rejectionReason && (
                    <div className="mt-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">
                        Причина отклонения:
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {ticket.rejectionReason}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Создано: {new Date(ticket.createdAt).toLocaleDateString("ru-RU")}</span>
                    {ticket.commentsCount > 0 && (
                      <>
                        <span>•</span>
                        <span>Комментариев: {ticket.commentsCount}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {ticket.chatId && (
                    <Link
                      href={`/dashboard/chats?chatId=${ticket.chatId}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      title="Открыть чат"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Чат
                    </Link>
                  )}
                  <button
                    onClick={() => router.push(`/dashboard/appeals/${ticket.id}`)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Открыть
                  </button>
                  {ticket.status !== "REJECTED" && ticket.status !== "CLOSED" && (
                    <button
                      onClick={() => {
                        setSelectedTicket(ticket);
                        setShowRejectModal(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Отклонить
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(ticket.id)}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Отклонить обращение</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Укажите причину отклонения обращения. Это сообщение будет отправлено автору обращения.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 mb-4"
              rows={4}
              placeholder="Причина отклонения..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleReject(selectedTicket)}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Отклонить
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason("");
                  setSelectedTicket(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
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

