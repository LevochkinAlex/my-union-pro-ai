"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface Appeal {
  id: string;
  publicId: string;
  type: string;
  status: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
}

const APPEAL_TYPES = {
  LEGAL: "Юридическое обращение",
  ACCOUNTING: "Бухгалтерское обращение",
  TECHNICAL: "Техническая поддержка",
  HR: "Кадровые вопросы",
  OTHER: "Прочее",
};

const APPEAL_STATUSES = {
  PENDING: { label: "Ожидание", color: "yellow" },
  IN_PROGRESS: { label: "В работе", color: "blue" },
  RESOLVED: { label: "Решено", color: "green" },
  REJECTED: { label: "Отклонено", color: "red" },
  CLOSED: { label: "Закрыто", color: "gray" },
};

export default function AppealsPage() {
  const { data: session } = useSession();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | keyof typeof APPEAL_STATUSES>("all");

  useEffect(() => {
    loadAppeals();
  }, []);

  const loadAppeals = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/appeals");
      if (!response.ok) {
        throw new Error("Ошибка загрузки обращений");
      }

      const data = await response.json();
      setAppeals(data.appeals || []);
    } catch (err) {
      console.error("Error loading appeals:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить обращения");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const statusInfo = APPEAL_STATUSES[status as keyof typeof APPEAL_STATUSES];
    const colorMap = {
      yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      gray: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };
    return colorMap[statusInfo?.color || "gray"] || colorMap.gray;
  };

  const filteredAppeals = filter === "all" 
    ? appeals 
    : appeals.filter(a => a.status === filter);

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Мои обращения</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Отслеживайте статус ваших обращений к профсоюзу
        </p>
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
        {Object.entries(APPEAL_STATUSES).map(([key, value]) => (
          <button
            key={key}
            onClick={() => setFilter(key as keyof typeof APPEAL_STATUSES)}
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

      {filteredAppeals.length === 0 ? (
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
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredAppeals.map((appeal) => (
            <div
              key={appeal.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {appeal.title}
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30">
                      #{appeal.publicId}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(appeal.status)}`}>
                      {APPEAL_STATUSES[appeal.status as keyof typeof APPEAL_STATUSES]?.label || appeal.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {APPEAL_TYPES[appeal.type as keyof typeof APPEAL_TYPES] || appeal.type}
                  </p>
                  {appeal.description && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {appeal.description}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Создано: {new Date(appeal.createdAt).toLocaleDateString("ru-RU")}</span>
                    <span>•</span>
                    <span>Сообщений: {appeal.messageCount}</span>
                    {appeal.lastMessage && (
                      <>
                        <span>•</span>
                        <span>Последнее: {new Date(appeal.lastMessage).toLocaleDateString("ru-RU")}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="ml-4">
                  <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
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
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
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

