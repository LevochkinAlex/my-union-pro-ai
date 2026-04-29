"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { OrganizationType, ReportStatus } from "@prisma/client";
import { ClipboardList } from "lucide-react";

interface Report {
  id: string;
  periodYear: number;
  periodMonth: number | null;
  status: ReportStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  confirmedAt: string | null;
  organization: {
    id: string;
    name: string;
    type: OrganizationType;
    chairmanName: string | null;
  };
  template: {
    id: string;
    name: string;
    code: string;
  };
}

interface ReportsData {
  reports: Report[];
  level: "PPO" | "MPO" | "RPO";
  organization: {
    id: string;
    name: string;
    type: OrganizationType;
  };
  stats: {
    byStatus: Record<string, number>;
    byOrganization: any[];
    total: number;
  };
}

const REPORT_STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; bgColor: string }> = {
  DRAFT: { label: "Подготовить", color: "text-orange-700", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
  SUBMITTED: { label: "На проверке", color: "text-yellow-700", bgColor: "bg-yellow-100 dark:bg-yellow-900/30" },
  APPROVED: { label: "Согласован", color: "text-blue-700", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  REVISION: { label: "На доработке", color: "text-red-700", bgColor: "bg-red-100 dark:bg-red-900/30" },
  CONFIRMED: { label: "Утверждён", color: "text-green-700", bgColor: "bg-green-100 dark:bg-green-900/30" },
};

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function formatPeriod(year: number, month: number | null): string {
  if (month) {
    return `${MONTHS[month - 1]} ${year}`;
  }
  return `${year} год`;
}

function getDeadline(year: number, month: number | null): Date {
  // Дедлайн: до 20-го числа следующего месяца
  if (month) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return new Date(nextYear, nextMonth - 1, 20);
  }
  // Для годовых отчётов: до 20 января следующего года
  return new Date(year + 1, 0, 20);
}

function getDeadlineStatus(deadline: Date, status: ReportStatus): { text: string; isOverdue: boolean; daysLeft: number } {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
  
  if (status === "CONFIRMED" || status === "APPROVED") {
    return { text: "Сдан", isOverdue: false, daysLeft };
  }
  
  if (daysLeft < 0) {
    return { text: `Просрочен на ${Math.abs(daysLeft)} дн.`, isOverdue: true, daysLeft };
  }
  
  if (daysLeft === 0) {
    return { text: "Сегодня последний день", isOverdue: false, daysLeft };
  }
  
  if (daysLeft <= 7) {
    return { text: `Осталось ${daysLeft} дн.`, isOverdue: false, daysLeft };
  }
  
  return { text: deadline.toLocaleDateString("ru-RU"), isOverdue: false, daysLeft };
}

export default function OrgHeadReportsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<ReportsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Фильтры
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedPeriodicity, setSelectedPeriodicity] = useState<"all" | "monthly" | "annual">("all");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const loadReports = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (selectedPeriod) params.set("period", selectedPeriod);
        if (selectedStatus && selectedStatus !== "all") params.set("status", selectedStatus);
        if (selectedPeriodicity !== "all") params.set("periodicity", selectedPeriodicity);
        if (selectedOrganizationId !== "all") params.set("organizationId", selectedOrganizationId);
        
        const res = await fetch(`/api/org-head/reports?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Ошибка загрузки");
        }
        const data = await res.json();
        setData(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadReports();
  }, [selectedPeriod, selectedStatus, selectedPeriodicity, selectedOrganizationId]);

  // Фильтрация по поиску
  const filteredReports = useMemo(() => {
    if (!data?.reports) return [];
    if (!searchQuery.trim()) return data.reports;
    
    const query = searchQuery.toLowerCase();
    return data.reports.filter((r) =>
      r.organization.name.toLowerCase().includes(query) ||
      r.organization.chairmanName?.toLowerCase().includes(query)
    );
  }, [data?.reports, searchQuery]);

  // Генерация опций для периода
  const periodOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Текущий год + предыдущий
    for (let year = currentYear; year >= currentYear - 1; year--) {
      for (let month = 12; month >= 1; month--) {
        // Пропускаем будущие месяцы
        if (year === currentYear && month > now.getMonth() + 1) continue;
        
        options.push({
          value: `${year}-${String(month).padStart(2, '0')}`,
          label: `${MONTHS[month - 1]} ${year}`,
        });
      }
    }
    
    return options;
  }, []);

  const organizationOptions = useMemo(() => {
    if (!data?.reports) return [];
    const map = new Map<string, string>();
    for (const r of data.reports) {
      map.set(r.organization.id, r.organization.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data?.reports]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
        <p className="text-red-600 dark:text-red-400">{error || "Ошибка загрузки данных"}</p>
      </div>
    );
  }

  const levelLabel =
    data.level === "RPO"
      ? "Региональная организация"
      : data.level === "MPO"
      ? "Местная организация"
      : "Первичная организация";

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <ClipboardList className="h-7 w-7" /> Отчётность организаций
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            {levelLabel}: {data.organization?.name}
          </p>
        </div>
        
        <Link
          href="/dashboard/statistics"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Статистика
        </Link>
      </div>

      {/* Статусы в виде карточек */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Object.entries(REPORT_STATUS_CONFIG).map(([status, config]) => {
          const count = data.stats.byStatus[status] || 0;
          const isActive = selectedStatus === status;
          return (
            <button
              key={status}
              onClick={() => setSelectedStatus(isActive ? "all" : status)}
              className={`rounded-xl p-4 text-left transition-all ${
                isActive
                  ? `${config.bgColor} ring-2 ring-offset-2 ring-blue-500`
                  : "bg-white dark:bg-gray-800 hover:shadow-md"
              }`}
            >
              <p className={`text-sm font-medium ${config.color} dark:opacity-80`}>
                {config.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {count}
              </p>
            </button>
          );
        })}
      </div>

      {/* Фильтры */}
      <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800 sm:flex-row sm:items-center">
        {/* Поиск */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Поиск по названию организации..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 pl-10 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <svg
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Период */}
        <select
          aria-label="Период отчёта"
          title="Период отчёта"
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {periodOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Тип периодичности отчётов"
          title="Тип периодичности отчётов"
          value={selectedPeriodicity}
          onChange={(e) => setSelectedPeriodicity(e.target.value as "all" | "monthly" | "annual")}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="all">Все периоды</option>
          <option value="monthly">Месячные</option>
          <option value="annual">Годовые</option>
        </select>

        <select
          aria-label="Фильтр по организации"
          title="Фильтр по организации"
          value={selectedOrganizationId}
          onChange={(e) => setSelectedOrganizationId(e.target.value)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="all">Все организации</option>
          {organizationOptions.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>

        {/* Сброс фильтров */}
        {(selectedStatus !== "all" || searchQuery || selectedPeriodicity !== "all" || selectedOrganizationId !== "all") && (
          <button
            onClick={() => {
              setSelectedStatus("all");
              setSearchQuery("");
              setSelectedPeriodicity("all");
              setSelectedOrganizationId("all");
            }}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Таблица отчётов */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Наименование профсоюзной организации
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Период
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Срок
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Статус
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                  Дата утверждения
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {filteredReports.length > 0 ? (
                filteredReports.map((report) => {
                  const deadline = getDeadline(report.periodYear, report.periodMonth);
                  const deadlineStatus = getDeadlineStatus(deadline, report.status);
                  const statusConfig = REPORT_STATUS_CONFIG[report.status] || REPORT_STATUS_CONFIG.DRAFT;

                  return (
                    <tr
                      key={report.id}
                      className="hover-surface"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/reports/${report.id}`}
                          className="group"
                        >
                          <p className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {report.organization.name}
                          </p>
                          {report.organization.chairmanName && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Председатель: {report.organization.chairmanName}
                            </p>
                          )}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {formatPeriod(report.periodYear, report.periodMonth)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`text-sm ${
                            deadlineStatus.isOverdue
                              ? "font-medium text-red-600 dark:text-red-400"
                              : deadlineStatus.daysLeft <= 7
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {deadlineStatus.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {report.status === "DRAFT" ? (
                          <Link
                            href={`/dashboard/reports/${report.id}`}
                            className="inline-flex items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
                          >
                            Подготовить
                          </Link>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
                          >
                            {statusConfig.label}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {report.approvedAt
                          ? new Date(report.approvedAt).toLocaleDateString("ru-RU")
                          : report.confirmedAt
                          ? new Date(report.confirmedAt).toLocaleDateString("ru-RU")
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    Отчёты не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
