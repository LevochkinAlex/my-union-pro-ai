"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { OrganizationType } from "@prisma/client";
import { BarChart3, Building2, Users, ClipboardList, Mail, TrendingUp, User, AlertTriangle, Trophy } from "lucide-react";

interface TimeSeriesData {
  period: string;
  month: string;
  year: number;
  totalMembers: number;
  totalEmployees: number;
  membershipPercent: number;
}

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
    totalEmployees: number;
    membershipPercent: number;
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
  timeSeries: TimeSeriesData[];
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
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <BarChart3 className="h-7 w-7" /> Статистика и аналитика
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
          icon={<Building2 className="h-8 w-8" />}
          color="from-blue-500 to-blue-600"
        />
        <MetricCard
          title="Членов профсоюза"
          value={stats.stats.totalMembers}
          icon={<Users className="h-8 w-8" />}
          color="from-green-500 to-green-600"
        />
        <MetricCard
          title="Отчётов"
          value={stats.stats.reports.total}
          icon={<ClipboardList className="h-8 w-8" />}
          color="from-purple-500 to-purple-600"
        />
        <MetricCard
          title="Обращений"
          value={stats.stats.tickets.total}
          icon={<Mail className="h-8 w-8" />}
          color="from-orange-500 to-orange-600"
        />
      </div>

      {/* Графики временных рядов */}
      {stats.timeSeries && stats.timeSeries.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* График количества членов */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <Users className="h-5 w-5" /> Количество членов профсоюза
            </h2>
            <div className="h-64">
              <AreaChart data={stats.timeSeries} dataKey="totalMembers" color="#3b82f6" />
            </div>
          </div>

          {/* График процента членства */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              📊 Процент членов ППО
            </h2>
            <div className="h-64">
              <BarChart data={stats.timeSeries} dataKey="membershipPercent" color="#10b981" />
            </div>
          </div>
        </div>
      )}

      {/* Активность за 30 дней */}
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <TrendingUp className="h-5 w-5" /> Активность за последние 30 дней
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <ActivityCard
            label="Новых членов"
            value={stats.stats.recentActivity.newMembers}
            color="green"
            icon={<User className="h-6 w-6" />}
          />
          <ActivityCard
            label="Отчётов подано"
            value={stats.stats.recentActivity.newReports}
            color="purple"
            icon={<BarChart3 className="h-6 w-6" />}
          />
          <ActivityCard
            label="Обращений"
            value={stats.stats.recentActivity.newTickets}
            color="orange"
            icon={<Mail className="h-6 w-6" />}
          />
        </div>
      </div>

      {/* Статистика по отчётам и обращениям */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Отчёты по статусам */}
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <ClipboardList className="h-5 w-5" /> Отчёты по статусам
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
                        className={`h-full ${statusInfo.color} transition-all duration-500 w-[${percentage}%]`}
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
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Mail className="h-5 w-5" /> Обращения по статусам
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
                        className={`h-full ${statusInfo.color} transition-all duration-500 w-[${percentage}%]`}
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
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Trophy className="h-5 w-5" /> Топ организаций по количеству членов
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
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-red-800 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" /> Организации без отчёта за {formatPeriod(stats.stats.currentPeriod)}
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
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${color} p-6 text-white shadow-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
        <span className="opacity-80">{icon}</span>
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
  icon: React.ReactNode;
}) {
  const colors = {
    green: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
  };

  return (
    <div className={`rounded-lg p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2">
        <span className="shrink-0">{icon}</span>
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

// Компонент Area Chart (как в референсе)
function AreaChart({
  data,
  dataKey,
  color,
}: {
  data: TimeSeriesData[];
  dataKey: keyof TimeSeriesData;
  color: string;
}) {
  const maxValue = Math.max(...data.map((d) => Number(d[dataKey]) || 0));
  const minValue = Math.min(...data.map((d) => Number(d[dataKey]) || 0));
  const range = maxValue - minValue || 1;

  // SVG path для area chart
  const width = 100;
  const height = 100;
  const padding = 5;
  
  const points = data.map((d, i) => {
    const x = padding + ((width - 2 * padding) * i) / (data.length - 1);
    const y = height - padding - ((Number(d[dataKey]) - minValue) / range) * (height - 2 * padding);
    return { x, y, value: d[dataKey], month: d.month };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
        {/* Градиент для заливки */}
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        
        {/* Горизонтальные линии сетки */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <line
            key={pct}
            x1={padding}
            x2={width - padding}
            y1={height - padding - (pct / 100) * (height - 2 * padding)}
            y2={height - padding - (pct / 100) * (height - 2 * padding)}
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="0.5"
          />
        ))}

        {/* Заливка */}
        <path d={areaPath} fill={`url(#gradient-${dataKey})`} />
        
        {/* Линия */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Точки */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill={color} />
        ))}
      </svg>
      
      {/* Подписи по оси X */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[10px] text-gray-500 dark:text-gray-400">
        {data.filter((_, i) => i % 2 === 0 || i === data.length - 1).map((d, i) => (
          <span key={i}>{d.month}</span>
        ))}
      </div>
      
      {/* Текущее значение */}
      <div className="absolute right-0 top-0 rounded-lg bg-white/80 px-2 py-1 text-sm font-bold dark:bg-gray-800/80" style={{ color }}>
        {data[data.length - 1]?.[dataKey]}
      </div>
    </div>
  );
}

// Компонент Bar Chart (как в референсе)
function BarChart({
  data,
  dataKey,
  color,
}: {
  data: TimeSeriesData[];
  dataKey: keyof TimeSeriesData;
  color: string;
}) {
  const maxValue = Math.max(...data.map((d) => Number(d[dataKey]) || 0), 100);
  
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end justify-between gap-1 px-1">
        {data.map((d, i) => {
          const value = Number(d[dataKey]) || 0;
          const height = (value / maxValue) * 100;
          
          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center">
              <div
                className="w-full min-w-[8px] max-w-[24px] rounded-t-sm transition-all duration-300 group-hover:opacity-80"
                style={{
                  height: `${height}%`,
                  backgroundColor: color,
                  minHeight: value > 0 ? "4px" : "0",
                }}
              />
              
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-gray-700">
                {value}%
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Подписи по оси X */}
      <div className="mt-2 flex justify-between px-1 text-[10px] text-gray-500 dark:text-gray-400">
        {data.filter((_, i) => i % 2 === 0 || i === data.length - 1).map((d, i) => (
          <span key={i} className="text-center">{d.month}</span>
        ))}
      </div>
      
      {/* Текущее значение */}
      <div className="mt-2 text-center text-lg font-bold" style={{ color }}>
        {data[data.length - 1]?.[dataKey]}%
      </div>
    </div>
  );
}
