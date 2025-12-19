"use client";

import Link from "next/link";

interface PPOHeadDashboardProps {
  userName: string;
  organizationName: string;
  stats: {
    pendingAppeals: number;
    pendingMembers: number;
    activeMembers: number;
    totalNews: number;
    totalDocuments: number;
  };
  recentAppeals: Array<{
    id: string;
    publicId: string;
    title: string;
    status: string;
    createdAt: string;
    user: {
      firstName: string | null;
      lastName: string | null;
    };
  }>;
  recentMembers: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: string;
  }>;
}

const TICKET_STATUSES: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Ожидание", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  IN_PROGRESS: { label: "В работе", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  RESOLVED: { label: "Решено", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  REJECTED: { label: "Отклонено", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  CLOSED: { label: "Закрыто", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
};

export default function PPOHeadDashboard({
  userName,
  organizationName,
  stats,
  recentAppeals,
  recentMembers,
}: PPOHeadDashboardProps) {
  return (
    <div className="space-y-8 min-w-0 w-full">
      {/* Заголовок */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          С возвращением, {userName}!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Ваш личный кабинет председателя Профсоюза · {organizationName}
        </p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Link
          href="/dashboard/appeals"
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <svg className="h-6 w-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingAppeals}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Новых обращений</p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/members"
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <svg className="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingMembers}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">На валидации</p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/members"
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeMembers}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Активных членов</p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/news"
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalNews}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Новостей</p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/documents"
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalDocuments}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Документов</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Основной контент */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 min-w-0">
        {/* Левая колонка: Последние обращения (2/3 ширины на lg+) */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white">
                Последние обращения
              </h2>
              <Link
                href="/dashboard/appeals"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Все обращения
              </Link>
            </div>
            {recentAppeals.length > 0 ? (
              <div className="space-y-3">
                {recentAppeals.map((appeal) => (
                  <Link
                    key={appeal.id}
                    href={`/dashboard/appeals/${appeal.id}`}
                    className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-gray-900 dark:text-white truncate">
                            {appeal.title}
                          </h3>
                          <span className="text-xs font-mono text-purple-600 dark:text-purple-400">
                            #{appeal.publicId}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${TICKET_STATUSES[appeal.status]?.color || TICKET_STATUSES.PENDING.color}`}>
                            {TICKET_STATUSES[appeal.status]?.label || appeal.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          От: {[appeal.user.lastName, appeal.user.firstName].filter(Boolean).join(" ") || "Пользователь"}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(appeal.createdAt).toLocaleDateString("ru-RU")}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                Нет новых обращений
              </p>
            )}
          </div>
        </div>

        {/* Правая колонка: Сайдбар (1/3 ширины на lg+) */}
        <div className="space-y-6 min-w-0">
          {/* Заявки на вступление */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Заявки на вступление
              </h2>
              <Link
                href="/dashboard/members"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Все заявки
              </Link>
            </div>
            {recentMembers.length > 0 ? (
              <div className="space-y-3">
                {recentMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {[member.lastName, member.firstName].filter(Boolean).join(" ") || "Пользователь"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(member.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                      Ожидает
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">
                Нет новых заявок
              </p>
            )}
          </div>

          {/* Быстрые действия */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Быстрые действия
            </h2>
            <div className="space-y-2">
              <Link
                href="/dashboard/documents"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Создать документ
                </span>
              </Link>
              <Link
                href="/dashboard/news"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Создать новость
                </span>
              </Link>
              <Link
                href="/dashboard/chats/ppo-head"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Создать группу
                </span>
              </Link>
              <Link
                href="/dashboard/discounts"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Скидки и привилегии
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

