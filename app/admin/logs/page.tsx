"use client";

import { useEffect, useState } from "react";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import { AlertTriangle, Info, Siren, XCircle } from "lucide-react";

interface SystemLog {
  id: string;
  level: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  source: string;
  message: string;
  details?: Record<string, any>;
  stackTrace?: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  errors: number;
  warnings: number;
  critical: number;
  unresolved: number;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ERROR" | "WARNING" | "CRITICAL">("all");
  const [searchSource, setSearchSource] = useState("");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const url = new URL("/api/admin/logs", window.location.origin);
      url.searchParams.set("limit", "100");
      if (filter !== "all") url.searchParams.set("level", filter);
      if (searchSource) url.searchParams.set("source", searchSource);

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setLogs(data.logs);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveLog = async (logId: string) => {
    try {
      const response = await fetch("/api/admin/logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });

      if (response.ok) {
        setLogs(logs.map(log => 
          log.id === logId ? { ...log, resolved: true } : log
        ));
      }
    } catch (error) {
      console.error("Failed to resolve log:", error);
    }
  };

  const handleClearOldLogs = async () => {
    const confirmed = await confirm("Это удалит старые разрешенные логи (старше 30 дней). Продолжить?");
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch("/api/admin/logs?older_than_days=30", {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        alertSuccess(`Удалено ${data.deletedCount} логов`);
        fetchLogs();
      }
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "ERROR":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "WARNING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return <Siren className="h-3.5 w-3.5" />;
      case "ERROR":
        return <XCircle className="h-3.5 w-3.5" />;
      case "WARNING":
        return <AlertTriangle className="h-3.5 w-3.5" />;
      default:
        return <Info className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Система логирования</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Мониторинг ошибок и событий системы
        </p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Всего логов</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.critical}</div>
            <div className="text-sm text-red-700 dark:text-red-300">Критические</div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/40 dark:bg-orange-900/20">
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.errors}</div>
            <div className="text-sm text-orange-700 dark:text-orange-300">Ошибки</div>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/40 dark:bg-yellow-900/20">
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{stats.warnings}</div>
            <div className="text-sm text-yellow-700 dark:text-yellow-300">Предупреждения</div>
          </div>
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900/40 dark:bg-purple-900/20">
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.unresolved}</div>
            <div className="text-sm text-purple-700 dark:text-purple-300">Не решено</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setFilter("CRITICAL")}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filter === "CRITICAL"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              Критические
            </button>
            <button
              onClick={() => setFilter("ERROR")}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filter === "ERROR"
                  ? "bg-orange-600 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              Ошибки
            </button>
            <button
              onClick={() => setFilter("WARNING")}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filter === "WARNING"
                  ? "bg-yellow-600 text-white"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              Предупреждения
            </button>
          </div>
          <button
            onClick={handleClearOldLogs}
            className="ml-auto px-3 py-1 rounded-lg text-sm font-medium bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 transition-colors"
          >
            Очистить старые
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-600 dark:text-gray-400">Загрузка логов...</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-600 dark:text-gray-400">Логи не найдены</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Уровень
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Источник
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Сообщение
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Пользователь
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Время
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Действие
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tbody key={log.id}>
                    <tr className="border-b border-gray-100 dark:border-gray-700 hover-surface">
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                          <span className="inline-flex items-center gap-1">
                            {getLevelIcon(log.level)} {log.level}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400">
                        {log.source}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                        {log.message}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {log.user ? (
                          <span title={log.user.email}>
                            {log.user.firstName} {log.user.lastName}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("ru-RU")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
                          >
                            {expandedLog === log.id ? "Скрыть" : "Детали"}
                          </button>
                          {!log.resolved && (
                            <button
                              onClick={() => handleResolveLog(log.id)}
                              className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-xs font-medium"
                            >
                              Решить
                            </button>
                          )}
                          {log.resolved && (
                            <span className="text-green-600 text-xs font-medium">✓ Решено</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedLog === log.id && (
                      <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="space-y-3">
                            {log.details && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                  Детали:
                                </h4>
                                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto max-h-64">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.stackTrace && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                  Stack Trace:
                                </h4>
                                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto max-h-64">
                                  {log.stackTrace}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

