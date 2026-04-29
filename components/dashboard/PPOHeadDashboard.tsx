"use client";

import Link from "next/link";
import SubscriptionWidget from "@/components/dashboard/SubscriptionWidget";

interface PPOHeadDashboardProps {
  userName: string;
  organizationName: string;
  stats: {
    pendingAppeals: number;
    pendingMembers: number;
    activeMembers: number;
    totalNews: number;
    totalDocuments: number;
    // Новые поля для карточек как в референсе
    totalEmployees: number;
    appealSatisfactionPercent: number;
    growthYTD: number;
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

      {/* Основные показатели */}
      <div className="grid grid-cols-1 min-w-0 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Работников */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-blue-200/60 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/40 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-blue-200/50 dark:bg-blue-800/40" aria-hidden>
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Работников</p>
          <p className="text-2xl font-semibold tabular-nums text-blue-900 dark:text-blue-100 sm:text-3xl">{stats.totalEmployees}</p>
        </div>

        {/* Членов ППО */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-emerald-200/60 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/40 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-emerald-200/50 dark:bg-emerald-800/40" aria-hidden>
            <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Членов ППО</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100 sm:text-3xl">{stats.activeMembers}</p>
        </div>

        {/* Удовлетворённость обращениями */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-violet-200/60 bg-violet-50 dark:border-violet-800/50 dark:bg-violet-950/40 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-violet-200/50 dark:bg-violet-800/40" aria-hidden>
            <svg className="h-5 w-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Удовлетворённость обращениями</p>
          <p className="text-2xl font-semibold tabular-nums text-violet-900 dark:text-violet-100 sm:text-3xl">{stats.appealSatisfactionPercent}%</p>
        </div>

        {/* Рост к началу года */}
        <div className={`min-w-0 overflow-hidden rounded-2xl border p-4 sm:p-5 flex flex-col gap-4 ${stats.growthYTD >= 0 ? 'border-teal-200/60 bg-teal-50 dark:border-teal-800/50 dark:bg-teal-950/40' : 'border-rose-200/60 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-950/40'}`}>
          <div className={`flex shrink-0 w-10 h-10 items-center justify-center rounded-xl ${stats.growthYTD >= 0 ? 'bg-teal-200/50 dark:bg-teal-800/40' : 'bg-rose-200/50 dark:bg-rose-800/40'}`} aria-hidden>
            {stats.growthYTD >= 0 ? (
              <svg className="h-5 w-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            )}
          </div>
          <p className={`text-sm font-medium ${stats.growthYTD >= 0 ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300'}`}>Рост к началу года</p>
          <p className={`text-2xl font-semibold tabular-nums sm:text-3xl ${stats.growthYTD >= 0 ? 'text-teal-900 dark:text-teal-100' : 'text-rose-900 dark:text-rose-100'}`}>
            {stats.growthYTD > 0 ? "+" : ""}{stats.growthYTD}%
          </p>
        </div>
      </div>

      {/* Подписка и доступы */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SubscriptionWidget />
      </div>

      {/* Операционная статистика */}
      <div className="grid grid-cols-1 min-w-0 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Link
          href="/dashboard/appeals"
          className="min-w-0 overflow-hidden rounded-2xl border border-amber-200/60 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/40 p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
        >
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-amber-200/50 dark:bg-amber-800/40" aria-hidden>
            <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Новых обращений</p>
          <p className="text-2xl font-semibold tabular-nums text-amber-900 dark:text-amber-100 sm:text-3xl">{stats.pendingAppeals}</p>
        </Link>

        <Link
          href="/dashboard/members"
          className="min-w-0 overflow-hidden rounded-2xl border border-orange-200/60 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/40 p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
        >
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-orange-200/50 dark:bg-orange-800/40" aria-hidden>
            <svg className="h-5 w-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-orange-800 dark:text-orange-200">На проверке</p>
          <p className="text-2xl font-semibold tabular-nums text-orange-900 dark:text-orange-100 sm:text-3xl">{stats.pendingMembers}</p>
        </Link>

        <Link
          href="/dashboard/members"
          className="min-w-0 overflow-hidden rounded-2xl border border-green-200/60 bg-green-50 dark:border-green-800/50 dark:bg-green-950/40 p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
        >
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-green-200/50 dark:bg-green-800/40" aria-hidden>
            <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Активных членов</p>
          <p className="text-2xl font-semibold tabular-nums text-green-900 dark:text-green-100 sm:text-3xl">{stats.activeMembers}</p>
        </Link>

        <Link
          href="/dashboard/news"
          className="min-w-0 overflow-hidden rounded-2xl border border-sky-200/60 bg-sky-50 dark:border-sky-800/50 dark:bg-sky-950/40 p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
        >
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-sky-200/50 dark:bg-sky-800/40" aria-hidden>
            <svg className="h-5 w-5 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-sky-800 dark:text-sky-200">Новостей</p>
          <p className="text-2xl font-semibold tabular-nums text-sky-900 dark:text-sky-100 sm:text-3xl">{stats.totalNews}</p>
        </Link>

        <Link
          href="/dashboard/documents"
          className="min-w-0 overflow-hidden rounded-2xl border border-indigo-200/60 bg-indigo-50 dark:border-indigo-800/50 dark:bg-indigo-950/40 p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
        >
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-indigo-200/50 dark:bg-indigo-800/40" aria-hidden>
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">Документов</p>
          <p className="text-2xl font-semibold tabular-nums text-indigo-900 dark:text-indigo-100 sm:text-3xl">{stats.totalDocuments}</p>
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
                    className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover-surface"
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
                className="flex items-center gap-3 p-3 rounded-lg hover-surface"
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
                className="flex items-center gap-3 p-3 rounded-lg hover-surface"
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
                className="flex items-center gap-3 p-3 rounded-lg hover-surface"
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
                className="flex items-center gap-3 p-3 rounded-lg hover-surface"
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

