"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TicketStatistics {
  total: number;
  resolved: number;
  pending: number;
  inProgress: number;
  rejected: number;
  resolutionRate: number;
  avgRating: string | null;
  ratedCount: number;
  avgResolutionTime: number | null;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  ratingDistribution: Record<number, number>;
  byMonth: Record<number, { total: number; resolved: number }> | null;
}

interface RatedTicket {
  id: string;
  rating: number | null;
  comment: string | null;
  user: string;
  resolvedAt: string | null;
}

interface ReportTemplate {
  id: string;
  code: string;
  name: string;
  periodicity: string;
  reportsCount: number;
}

interface Report {
  id: string;
  periodYear: number;
  periodMonth: number | null;
  status: "DRAFT" | "SUBMITTED" | "REVISION" | "APPROVED" | "CONFIRMED";
  deadline: string | null;
  deadlineStatus: "ok" | "warning" | "overdue";
  daysLeft: number | null;
  createdAt: string;
  updatedAt: string;
  template: {
    code: string;
    name: string;
    periodicity: string;
  };
  organization: {
    id: string;
    name: string;
    type: string;
  };
}

const STATUS_LABELS: Record<Report["status"], string> = {
  DRAFT: "Черновик",
  SUBMITTED: "На согласовании",
  REVISION: "На доработке",
  APPROVED: "Согласован",
  CONFIRMED: "Утверждён",
};

const STATUS_COLORS: Record<Report["status"], string> = {
  DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  SUBMITTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  REVISION: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  CONFIRMED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
};

const PERIODICITY_LABELS: Record<string, string> = {
  MONTHLY: "Ежемесячный",
  QUARTERLY: "Квартальный",
  SEMI_ANNUAL: "Полугодовой",
  ANNUAL: "Годовой",
};

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewReportModal, setShowNewReportModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  
  // Статистика по обращениям
  const [ticketStats, setTicketStats] = useState<TicketStatistics | null>(null);
  const [recentRated, setRecentRated] = useState<RatedTicket[]>([]);
  const [statsYear, setStatsYear] = useState<number>(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState<'reports' | 'tickets'>('reports');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Загружаем отчёты, шаблоны и статистику по обращениям параллельно
      const [reportsRes, templatesRes, ticketStatsRes] = await Promise.all([
        fetch("/api/ppo-head/reports"),
        fetch("/api/ppo-head/reports/templates"),
        fetch(`/api/ppo-head/tickets/statistics?year=${statsYear}`),
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports || []);
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }
      
      if (ticketStatsRes.ok) {
        const data = await ticketStatsRes.json();
        setTicketStats(data.statistics || null);
        setRecentRated(data.recentRated || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки данных:", error);
    } finally {
      setLoading(false);
    }
  }, [statsYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Получить выбранный шаблон
  const getSelectedTemplateData = () => {
    return templates.find((t) => t.id === selectedTemplate);
  };

  // Нужен ли месяц для выбранного шаблона
  const needsMonth = () => {
    const template = getSelectedTemplateData();
    return template && ["MONTHLY", "QUARTERLY"].includes(template.periodicity);
  };

  const handleCreateReport = async () => {
    if (!selectedTemplate || !selectedYear) return;

    setCreating(true);
    try {
      const template = getSelectedTemplateData();
      const periodMonth = needsMonth() ? selectedMonth : undefined;

      const response = await fetch("/api/ppo-head/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate,
          periodYear: selectedYear,
          periodMonth,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowNewReportModal(false);
        router.push(`/dashboard/reports/${data.report.id}`);
      } else if (data.reportId) {
        // Отчёт уже существует
        router.push(`/dashboard/reports/${data.reportId}`);
      } else {
        alert(data.error || "Ошибка создания отчёта");
      }
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Ошибка создания отчёта");
    } finally {
      setCreating(false);
    }
  };

  // Фильтрация отчётов
  const filteredReports = reports.filter((report) => {
    if (filterStatus !== "all" && report.status !== filterStatus) return false;
    if (filterYear !== "all" && report.periodYear !== parseInt(filterYear)) return false;
    return true;
  });

  // Получаем уникальные года для фильтра
  const uniqueYears = [...new Set(reports.map((r) => r.periodYear))].sort((a, b) => b - a);

  // Статистика
  const stats = {
    total: reports.length,
    drafts: reports.filter((r) => r.status === "DRAFT").length,
    submitted: reports.filter((r) => r.status === "SUBMITTED").length,
    revision: reports.filter((r) => r.status === "REVISION").length,
    approved: reports.filter((r) => r.status === "APPROVED" || r.status === "CONFIRMED").length,
    overdue: reports.filter((r) => r.deadlineStatus === "overdue").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Отчётность
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Управление отчётами организации
          </p>
        </div>
        {activeTab === 'reports' && (
          <button
            onClick={() => setShowNewReportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать отчёт
          </button>
        )}
      </div>
      
      {/* Табы */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Форма отчётности
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'tickets'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Статистика по обращениям
        </button>
      </div>

      {activeTab === 'reports' && (
        <>
      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Всего</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">{stats.drafts}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Черновики</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-blue-600">{stats.submitted}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">На согласовании</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-orange-600">{stats.revision}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">На доработке</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Утверждены</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Просрочены</div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
        >
          <option value="all">Все статусы</option>
          <option value="DRAFT">Черновики</option>
          <option value="SUBMITTED">На согласовании</option>
          <option value="REVISION">На доработке</option>
          <option value="APPROVED">Согласованы</option>
          <option value="CONFIRMED">Утверждены</option>
        </select>

        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
        >
          <option value="all">Все годы</option>
          {uniqueYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Список отчётов */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-8 text-center">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              Нет отчётов
            </h3>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Создайте первый отчёт, нажав кнопку выше
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Отчёт
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Период
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Статус
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Срок сдачи
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Обновлён
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredReports.map((report) => (
                <tr
                  key={report.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-4 py-4">
                    <Link
                      href={`/dashboard/reports/${report.id}`}
                      className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {report.template.name}
                    </Link>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {PERIODICITY_LABELS[report.template.periodicity]}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                    {report.periodYear}
                    {report.periodMonth && ` / ${report.periodMonth} мес.`}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        STATUS_COLORS[report.status]
                      }`}
                    >
                      {STATUS_LABELS[report.status]}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {report.deadline ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm ${
                            report.deadlineStatus === "overdue"
                              ? "text-red-600"
                              : report.deadlineStatus === "warning"
                              ? "text-orange-600"
                              : "text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {new Date(report.deadline).toLocaleDateString("ru-RU")}
                        </span>
                        {report.daysLeft !== null && report.daysLeft <= 7 && (
                          <span
                            className={`text-xs ${
                              report.deadlineStatus === "overdue"
                                ? "text-red-500"
                                : "text-orange-500"
                            }`}
                          >
                            {report.daysLeft < 0
                              ? `(просрочен на ${Math.abs(report.daysLeft)} дн.)`
                              : report.daysLeft === 0
                              ? "(сегодня)"
                              : `(осталось ${report.daysLeft} дн.)`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(report.updatedAt).toLocaleDateString("ru-RU", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/dashboard/reports/${report.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {report.status === "DRAFT" || report.status === "REVISION"
                        ? "Редактировать"
                        : "Открыть"}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}
      
      {/* Статистика по обращениям */}
      {activeTab === 'tickets' && ticketStats && (
        <div className="space-y-6">
          {/* Выбор периода */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Год:
            </label>
            <select
              value={statsYear}
              onChange={(e) => setStatsYear(parseInt(e.target.value))}
              className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
            >
              {[2024, 2025, 2026].map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          
          {/* Основная статистика */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{ticketStats.total}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Всего обращений</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-green-600">{ticketStats.resolved}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Решено</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-yellow-600">{ticketStats.pending}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Ожидание</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-blue-600">{ticketStats.inProgress}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">В работе</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-3xl font-bold text-red-600">{ticketStats.rejected}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Отклонено</div>
            </div>
          </div>
          
          {/* Показатели эффективности */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Процент решений */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Процент решённых</h3>
                <span className="text-2xl font-bold text-green-600">{ticketStats.resolutionRate}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${ticketStats.resolutionRate}%` }}
                />
              </div>
            </div>
            
            {/* Средняя оценка */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Средняя оценка</h3>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-yellow-500">{ticketStats.avgRating || '—'}</span>
                  <svg className="h-6 w-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                На основе {ticketStats.ratedCount} оценок
              </div>
              {/* Распределение оценок */}
              <div className="mt-4 space-y-2">
                {[5, 4, 3, 2, 1].map((star) => (
                  <div key={star} className="flex items-center gap-2 text-sm">
                    <div className="w-8 flex items-center gap-0.5 text-gray-600 dark:text-gray-400">
                      <span>{star}</span>
                      <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${star >= 4 ? 'bg-green-500' : star >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ 
                          width: ticketStats.ratedCount > 0 
                            ? `${(ticketStats.ratingDistribution[star] / ticketStats.ratedCount) * 100}%` 
                            : '0%' 
                        }}
                      />
                    </div>
                    <span className="w-8 text-gray-500 dark:text-gray-400 text-right">
                      {ticketStats.ratingDistribution[star]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Среднее время решения */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Среднее время решения</h3>
                <span className="text-2xl font-bold text-blue-600">
                  {ticketStats.avgResolutionTime !== null ? `${ticketStats.avgResolutionTime} дн.` : '—'}
                </span>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Среднее время от создания до закрытия обращения
              </div>
            </div>
          </div>
          
          {/* График по месяцам */}
          {ticketStats.byMonth && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Динамика обращений по месяцам</h3>
              <div className="grid grid-cols-12 gap-2">
                {Object.entries(ticketStats.byMonth).map(([month, data]) => {
                  const maxTotal = Math.max(...Object.values(ticketStats.byMonth!).map(d => d.total), 1);
                  const heightPercent = (data.total / maxTotal) * 100;
                  const resolvedPercent = data.total > 0 ? (data.resolved / data.total) * 100 : 0;
                  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
                  
                  return (
                    <div key={month} className="flex flex-col items-center">
                      <div className="h-32 w-full flex items-end justify-center">
                        <div 
                          className="w-full max-w-[24px] bg-gray-200 dark:bg-gray-700 rounded-t relative overflow-hidden"
                          style={{ height: `${heightPercent}%`, minHeight: data.total > 0 ? '8px' : '0' }}
                        >
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-green-500 to-green-400"
                            style={{ height: `${resolvedPercent}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {monthNames[parseInt(month) - 1]}
                      </div>
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {data.total}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                  <span className="text-gray-500 dark:text-gray-400">Всего</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span className="text-gray-500 dark:text-gray-400">Решено</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Последние оценки */}
          {recentRated.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Последние отзывы пользователей</h3>
              <div className="space-y-4">
                {recentRated.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex-shrink-0 flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg
                          key={star}
                          className={`h-5 w-5 ${
                            star <= (item.rating || 0)
                              ? "text-yellow-400"
                              : "text-gray-300 dark:text-gray-600"
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-white">{item.user}</span>
                        {item.resolvedAt && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(item.resolvedAt).toLocaleDateString('ru-RU')}
                          </span>
                        )}
                      </div>
                      {item.comment && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">{item.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Модалка создания отчёта */}
      {showNewReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Создать новый отчёт
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Шаблон отчёта
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Выберите шаблон...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({PERIODICITY_LABELS[template.periodicity]})
                    </option>
                  ))}
                </select>
              </div>

              <div className={needsMonth() ? "grid grid-cols-2 gap-4" : ""}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Год
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {[2024, 2025, 2026].map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                {needsMonth() && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Месяц
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {[
                        { value: 1, label: "Январь" },
                        { value: 2, label: "Февраль" },
                        { value: 3, label: "Март" },
                        { value: 4, label: "Апрель" },
                        { value: 5, label: "Май" },
                        { value: 6, label: "Июнь" },
                        { value: 7, label: "Июль" },
                        { value: 8, label: "Август" },
                        { value: 9, label: "Сентябрь" },
                        { value: 10, label: "Октябрь" },
                        { value: 11, label: "Ноябрь" },
                        { value: 12, label: "Декабрь" },
                      ].map((month) => (
                        <option key={month.value} value={month.value}>
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowNewReportModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateReport}
                disabled={!selectedTemplate || creating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {creating ? "Создание..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
