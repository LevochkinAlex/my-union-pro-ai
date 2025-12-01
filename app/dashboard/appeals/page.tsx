"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

const PRIORITY_COLORS = {
  LOW: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const PRIORITY_LABELS = {
  LOW: "Низкая",
  MEDIUM: "Средняя",
  HIGH: "Высокая",
  URGENT: "Срочная",
};

export default function AppealsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | keyof typeof TICKET_STATUSES>("all");

  useEffect(() => {
    loadTickets();
  }, [filter]);

  const loadTickets = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = filter === "all" ? "/api/tickets" : `/api/tickets?status=${filter}`;
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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Мои обращения</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Отслеживайте статус ваших обращений к профсоюзу
          </p>
        </div>
        <Link
          href="/dashboard/appeals/new"
          className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
        >
          + Создать обращение
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
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
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Обращений не найдено
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Создайте новое обращение, чтобы получить помощь от профсоюза
          </p>
          <Link
            href="/dashboard/appeals/new"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Создать обращение
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {ticket.title}
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30">
                      #{ticket.publicId}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {TICKET_STATUSES[ticket.status as keyof typeof TICKET_STATUSES]?.label || ticket.status}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM}`}>
                      {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS] || ticket.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {TICKET_TYPES[ticket.type as keyof typeof TICKET_TYPES] || ticket.type}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Создано: {new Date(ticket.createdAt).toLocaleDateString("ru-RU")}</span>
                    {ticket.attachmentsCount > 0 && (
                      <>
                        <span>•</span>
                        <span>Файлов: {ticket.attachmentsCount}</span>
                      </>
                    )}
                    {ticket.commentsCount > 0 && (
                      <>
                        <span>•</span>
                        <span>Комментариев: {ticket.commentsCount}</span>
                      </>
                    )}
                    {ticket.lastCommentAt && (
                      <>
                        <span>•</span>
                        <span>Последний ответ: {new Date(ticket.lastCommentAt).toLocaleDateString("ru-RU")}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  <button
                    onClick={() => router.push(`/dashboard/appeals/${ticket.id}`)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    Подробнее
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
