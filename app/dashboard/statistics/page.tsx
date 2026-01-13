"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { OrganizationType } from "@prisma/client";

interface Stats {
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
    orgsWithoutReport: any[];
    recentActivity: {
      newMembers: number;
      newReports: number;
      newTickets: number;
    };
  };
  organizations: any[];
}

const REPORT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Черновик", color: "bg-gray-500" },
  SUBMITTED: { label: "На проверке", color: "bg-yellow-500" },
  APPROVED: { label: "Утверждён", color: "bg-green-500" },
  REJECTED: { label: "Отклонён", color: "bg-red-500" },
  CONFIRMED: { label: "Подтверждён", color: "bg-blue-500" },
};

const TICKET_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING_REVIEW: { label: "Ожидает", color: "bg-yellow-500" },
  IN_PROGRESS: { label: "В работе", color: "bg-blue-500" },
  RESOLVED: { label: "Решено", color: "bg-green-500" },
  CLOSED: { label: "Закрыто", color: "bg-gray-500" },
};

export default function StatisticsPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
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

  const levelLabel =
    stats.level === "RPO"
      ? "Региональная организация"
      : stats.level === "MPO"
      ? "Местная организация"
      : "Первичная организация";

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          📊 Статистика и аналитика
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          {levelLabel}: {stats.organization?.name}
        </p>
      </div>

      {/* Основные метрики */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Организаций"
          value={stats.stats.totalOrganizations}
          icon="🏛️"
          color="from-blue-500 to-blue-600"
        />
        <MetricCard
          title="Членов профсоюза"
          value={stats.stats.totalMembers}
          icon="👥"
          color="from-green-500 to-green-600"
        />
        <MetricCard
          title="Отчётов"
          value={stats.stats.reports.total}
          icon="📋"
          color="from-purple-500 to-purple-600"
        />
        <MetricCard
          title="Обращений"
          value={stats.stats.tickets.total}
          icon="📨"
          color="from-orange-500 to-orange-600"
        />
      </div>

      {/* Активность за 30 дней */}
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          📈 Активность за последние 30 дней
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <ActivityCard
            label="Новых членов"
            value={stats.stats.recentActivity.newMembers}
            color="green"
            icon="👤"
          />
          <ActivityCard
            label="Отчётов подано"
            value={stats.stats.recentActivity.newReports}
            color="purple"
            icon="📊"
          />
          <ActivityCard
            label="Обращений"
            value={stats.stats.recentActivity.newTickets}
            color="orange"
            icon="✉️"
          />
        </div>
      </div>

      {/* Статистика по отчётам и обращениям */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Отчёты по статусам */}
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            📋 Отчёты по статусам
          </h2>
          {Object.keys(stats.stats.reports.byStatus).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(stats.stats.reports.byStatus).map(([status, count]) => {
                const statusInfo = REPORT_STATUS_LABELS[status] || { label: status, color: "bg-gray-500" };
                const percentage = stats.stats.reports.total > 0
                  ? Math.round((count / stats.stats.reports.total) * 100)
                  : 0;
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{statusInfo.label}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-full ${statusInfo.color} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400">Нет данных</p>
          )}
        </div>

        {/* Обращения по статусам */}
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            📨 Обращения по статусам
          </h2>
          {Object.keys(stats.stats.tickets.byStatus).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(stats.stats.tickets.byStatus).map(([status, count]) => {
                const statusInfo = TICKET_STATUS_LABELS[status] || { label: status, color: "bg-gray-500" };
                const percentage = stats.stats.tickets.total > 0
                  ? Math.round((count / stats.stats.tickets.total) * 100)
                  : 0;
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{statusInfo.label}</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={`h-full ${statusInfo.color} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400">Нет данных</p>
          )}
        </div>
      </div>

      {/* Топ организаций по членам */}
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          🏆 Топ организаций по количеству членов
        </h2>
        <div className="space-y-3">
          {stats.organizations
            .sort((a, b) => b.membersCount - a.membersCount)
            .slice(0, 10)
            .map((org, index) => (
              <div
                key={org.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {org.chairmanName || "Председатель не назначен"}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {org.membersCount}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Организации без отчёта */}
      {stats.stats.orgsWithoutReport.length > 0 && (
        <div className="rounded-xl bg-red-50 p-6 shadow-sm dark:bg-red-900/20">
          <h2 className="mb-4 text-lg font-semibold text-red-800 dark:text-red-300">
            ⚠️ Организации без отчёта за {formatPeriod(stats.stats.currentPeriod)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.stats.orgsWithoutReport.map((org) => (
              <div
                key={org.id}
                className="rounded-lg bg-white p-3 shadow-sm dark:bg-gray-800"
              >
                <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {org.chairmanName || "Председатель не назначен"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} p-6 text-white shadow-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
        <span className="text-4xl opacity-80">{icon}</span>
      </div>
    </div>
  );
}

function ActivityCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: "green" | "purple" | "orange";
  icon: string;
}) {
  const colors = {
    green: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
  };

  return (
    <div className={`rounded-lg p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm opacity-80">{label}</p>
          <p className="text-2xl font-bold">+{value}</p>
        </div>
      </div>
    </div>
  );
}

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  const months = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  return `${months[parseInt(month) - 1]} ${year}`;
}
