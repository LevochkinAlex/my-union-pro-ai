"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Загружаем отчёты и шаблоны параллельно
      const [reportsRes, templatesRes] = await Promise.all([
        fetch("/api/ppo-head/reports"),
        fetch("/api/ppo-head/reports/templates"),
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports || []);
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки данных:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateReport = async () => {
    if (!selectedTemplate || !selectedYear) return;

    setCreating(true);
    try {
      const response = await fetch("/api/ppo-head/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate,
          periodYear: selectedYear,
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
        <button
          onClick={() => setShowNewReportModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Создать отчёт
        </button>
      </div>

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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Отчётный период (год)
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
