"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { OrganizationType } from "@prisma/client";
import { Building2, Users, BarChart3, Mail, TrendingUp, AlertTriangle, CheckCircle, MessageCircle } from "lucide-react";

interface OrgStats {
  level: "PPO" | "MPO" | "RPO";
  organization: {
    id: string;
    name: string;
    type: OrganizationType;
  };
  stats: {
    totalOrganizations: number;
    totalMembers: number;
    reports: {
      byStatus: Record<string, number>;
      total: number;
    };
    tickets: {
      byStatus: Record<string, number>;
      total: number;
    };
    currentPeriod: string;
    orgsWithoutReport: {
      id: string;
      name: string;
      type: OrganizationType;
      chairmanName: string | null;
    }[];
    recentActivity: {
      newMembers: number;
      newReports: number;
      newTickets: number;
    };
  };
  organizations: {
    id: string;
    name: string;
    type: OrganizationType;
    chairmanName: string | null;
    membersCount: number;
    reportsCount: number;
  }[];
}

const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  PRIMARY: "ППО",
  LOCAL: "МПО",
  REGIONAL: "РПО",
  FEDERAL: "ФПО",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SUBMITTED: "На проверке",
  APPROVED: "Утверждён",
  REJECTED: "Отклонён",
  CONFIRMED: "Подтверждён",
};

export default function OrgHeadDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch("/api/org-head/stats");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Ошибка загрузки");
        }
        const data = await res.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
        <p className="text-red-600 dark:text-red-400">{error || "Ошибка загрузки данных"}</p>
      </div>
    );
  }

  const levelLabel = stats.level === "RPO" ? "Региональная организация" : "Местная организация";

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-100">{levelLabel}</p>
            <h1 className="mt-1 text-2xl font-bold">{stats.organization?.name}</h1>
          </div>
          <div className="rounded-lg bg-white/20 px-4 py-2">
            <p className="text-sm font-medium">Текущий период</p>
            <p className="text-xl font-bold">{formatPeriod(stats.stats.currentPeriod)}</p>
          </div>
        </div>
      </div>

      {/* Основные метрики */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Организаций"
          value={stats.stats.totalOrganizations}
          icon={<Building2 className="h-6 w-6" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Членов профсоюза"
          value={stats.stats.totalMembers}
          icon={<Users className="h-6 w-6" />}
          color="bg-green-500"
        />
        <StatCard
          title="Отчётов всего"
          value={stats.stats.reports.total}
          icon={<BarChart3 className="h-6 w-6" />}
          color="bg-purple-500"
        />
        <StatCard
          title="Обращений"
          value={stats.stats.tickets.total}
          icon={<Mail className="h-6 w-6" />}
          color="bg-orange-500"
        />
      </div>

      {/* Активность за 30 дней */}
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <TrendingUp className="h-5 w-5" /> Активность за последние 30 дней
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <p className="text-sm text-green-600 dark:text-green-400">Новых членов</p>
            <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-300">
              +{stats.stats.recentActivity.newMembers}
            </p>
          </div>
          <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
            <p className="text-sm text-purple-600 dark:text-purple-400">Отчётов подано</p>
            <p className="mt-1 text-2xl font-bold text-purple-700 dark:text-purple-300">
              {stats.stats.recentActivity.newReports}
            </p>
          </div>
          <div className="rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
            <p className="text-sm text-orange-600 dark:text-orange-400">Обращений</p>
            <p className="mt-1 text-2xl font-bold text-orange-700 dark:text-orange-300">
              {stats.stats.recentActivity.newTickets}
            </p>
          </div>
        </div>
      </div>

      {/* Статус отчётов */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Отчёты по статусам */}
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <BarChart3 className="h-5 w-5" /> Статус отчётов
          </h2>
          <div className="space-y-3">
            {Object.entries(stats.stats.reports.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  {REPORT_STATUS_LABELS[status] || status}
                </span>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${getStatusColor(status)}`}>
                  {count}
                </span>
              </div>
            ))}
            {Object.keys(stats.stats.reports.byStatus).length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400">Нет отчётов</p>
            )}
          </div>
        </div>

        {/* Организации без отчёта */}
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <AlertTriangle className="h-5 w-5" /> Не сдали отчёт за {formatPeriod(stats.stats.currentPeriod)}
          </h2>
          {stats.stats.orgsWithoutReport.length > 0 ? (
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {stats.stats.orgsWithoutReport.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between rounded-lg bg-red-50 p-3 dark:bg-red-900/20"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {org.chairmanName || "Председатель не назначен"}
                    </p>
                  </div>
                  <span className="rounded bg-gray-200 px-2 py-1 text-xs font-medium dark:bg-gray-700">
                    {ORG_TYPE_LABELS[org.type]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex items-center justify-center gap-2 text-center text-green-600 dark:text-green-400">
              <CheckCircle className="h-5 w-5 shrink-0" /> Все организации сдали отчёт
            </p>
          )}
        </div>
      </div>

      {/* Список организаций */}
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Building2 className="h-5 w-5" /> Подчинённые организации
          </h2>
          <Link
            href="/dashboard/organizations"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Все организации →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Организация
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Тип
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Председатель
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Членов
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Отчётов
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {stats.organizations.slice(0, 10).map((org) => (
                <tr key={org.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium dark:bg-gray-700">
                      {ORG_TYPE_LABELS[org.type]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                    {org.chairmanName || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                    {org.membersCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                    {org.reportsCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats.organizations.length > 10 && (
          <p className="mt-4 text-center text-sm text-gray-500">
            И ещё {stats.organizations.length - 10} организаций...
          </p>
        )}
      </div>

      {/* Быстрые действия */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction
          href="/dashboard/reports"
          icon={<BarChart3 className="h-8 w-8" />}
          title="Отчёты"
          description="Просмотр и утверждение"
        />
        <QuickAction
          href="/dashboard/organizations"
          icon={<Building2 className="h-8 w-8" />}
          title="Организации"
          description="Управление структурой"
        />
        <QuickAction
          href="/dashboard/users/org-head"
          icon={<Users className="h-8 w-8" />}
          title="Пользователи"
          description="Валидация и активные"
        />
        <QuickAction
          href="/dashboard/chats/ppo-head"
          icon={<MessageCircle className="h-8 w-8" />}
          title="Чаты"
          description="Общение и поддержка"
        />
      </div>
    </div>
  );
}

// Компонент статистической карточки
function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color} text-white`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

// Компонент быстрого действия
function QuickAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-800"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{icon}</span>
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </Link>
  );
}

// Форматирование периода
function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const months = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  return `${months[parseInt(month) - 1]} ${year}`;
}

// Цвет статуса
function getStatusColor(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    case "SUBMITTED":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "CONFIRMED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
  }
}
