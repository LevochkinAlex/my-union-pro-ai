"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import type { AppealType } from "@prisma/client";

interface Analytics {
  totalQuestions: number;
  totalResolved: number;
  averageResolutionTime: number;
  commonKeywords: string[];
  byType?: Record<AppealType, any[]>;
}

interface AnalyticsRecord {
  id: string;
  appealType: AppealType;
  totalCount: number;
  resolvedCount: number;
  averageResolutionTime?: number;
  periodStart: string;
  periodEnd: string;
}

export default function AppealAnalyticsPage() {
  const { data: session } = useSession();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [records, setRecords] = useState<AnalyticsRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [selectedType, setSelectedType] = useState<AppealType | "">("");

  // Check if user is admin
  if (session && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  useEffect(() => {
    loadAnalytics();
  }, [days, selectedType]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.append("days", days.toString());
      if (selectedType) {
        params.append("type", selectedType);
      }

      const response = await fetch(`/api/chat/analytics?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.analytics);
        setRecords(data.records);
      }
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      const params = new URLSearchParams();
      params.append("format", format);
      params.append("days", days.toString());
      if (selectedType) {
        params.append("type", selectedType);
      }

      const response = await fetch(`/api/admin/analytics-export?${params}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = response.headers
          .get("content-disposition")
          ?.split("filename=")[1]
          ?.replace(/"/g, "") || `analytics.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Error exporting analytics:", error);
    }
  };

  if (!analytics || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Загрузка аналитики...</p>
        </div>
      </div>
    );
  }

  const appealTypes: AppealType[] = ["LEGAL", "ACCOUNTING", "TECHNICAL", "OTHER"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Аналитика Appeal Bot
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Статистика вопросов и обращений пользователей
        </p>
      </div>

      {/* Filters and Export */}
      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Период (дни)
          </label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value={1}>Сегодня</option>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Тип обращения
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as AppealType | "")}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Все типы</option>
            <option value="LEGAL">Юридические</option>
            <option value="ACCOUNTING">Бухгалтерские</option>
            <option value="TECHNICAL">Технические</option>
            <option value="OTHER">Прочие</option>
          </select>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("csv")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            CSV
          </button>

          <button
            onClick={() => handleExport("pdf")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">Всего вопросов</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {analytics.totalQuestions}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">Решено</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {analytics.totalResolved}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {analytics.totalQuestions > 0
              ? `${((analytics.totalResolved / analytics.totalQuestions) * 100).toFixed(1)}%`
              : "0%"}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">Среднее время решения</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {analytics.averageResolutionTime
              ? `${analytics.averageResolutionTime.toFixed(1)}ч`
              : "—"}
          </p>
        </div>
      </div>

      {/* By Type */}
      {analytics.byType && Object.keys(analytics.byType).length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            По типам обращений
          </h2>
          <div className="space-y-3">
            {appealTypes.map((type) => {
              const typeData = analytics.byType?.[type] || [];
              const count = typeData.reduce((sum, record) => sum + record.totalCount, 0);
              const resolved = typeData.reduce((sum, record) => sum + record.resolvedCount, 0);
              const percentage =
                count > 0 ? ((count / analytics.totalQuestions) * 100).toFixed(1) : "0";

              return (
                <div key={type} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {type === "LEGAL"
                        ? "Юридические"
                        : type === "ACCOUNTING"
                          ? "Бухгалтерские"
                          : type === "TECHNICAL"
                            ? "Технические"
                            : "Прочие"}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {count} вопросов · {resolved} решено
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">{percentage}%</p>
                    <div className="w-20 h-2 bg-gray-200 rounded-full mt-1 dark:bg-gray-600">
                      <div
                        className="h-2 bg-blue-600 rounded-full"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Common Keywords */}
      {analytics.commonKeywords && analytics.commonKeywords.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Популярные ключевые слова
          </h2>
          <div className="flex flex-wrap gap-2">
            {analytics.commonKeywords.map((keyword, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm dark:bg-blue-900 dark:text-blue-200"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Records */}
      {records.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Записи по дням
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold text-gray-900 dark:text-white">
                    Дата
                  </th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-900 dark:text-white">
                    Тип
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-900 dark:text-white">
                    Всего
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-900 dark:text-white">
                    Решено
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-900 dark:text-white">
                    Среднее время
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="py-2 px-3 text-gray-900 dark:text-white">
                      {new Date(record.periodStart).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="py-2 px-3 text-gray-900 dark:text-white">
                      {record.appealType === "LEGAL"
                        ? "Юридические"
                        : record.appealType === "ACCOUNTING"
                          ? "Бухгалтерские"
                          : record.appealType === "TECHNICAL"
                            ? "Технические"
                            : "Прочие"}
                    </td>
                    <td className="text-right py-2 px-3 text-gray-900 dark:text-white">
                      {record.totalCount}
                    </td>
                    <td className="text-right py-2 px-3 text-green-600">
                      {record.resolvedCount}
                    </td>
                    <td className="text-right py-2 px-3 text-gray-900 dark:text-white">
                      {record.averageResolutionTime
                        ? `${record.averageResolutionTime.toFixed(1)}ч`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

