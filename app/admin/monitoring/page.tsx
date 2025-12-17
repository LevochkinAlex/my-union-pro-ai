"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usage: number;
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usage: number;
  };
  database: {
    connections: number;
    slowQueries: number;
  };
  redis: {
    connected: boolean;
    memory: number;
    keys: number;
  };
}

interface PerformanceStats {
  total: number;
  average: number;
  slow: number;
  slowPercentage: number;
  cacheHitRate: number;
  byEndpoint: Record<string, {
    count: number;
    average: number;
    slow: number;
    cacheHitRate: number;
  }>;
}

export default function MonitoringPage() {
  const { data: session } = useSession();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [performance, setPerformance] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sentryUrl, setSentryUrl] = useState<string | null>(null);
  const [grafanaUrl, setGrafanaUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Обновляем каждые 30 секунд
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [metricsRes, perfRes] = await Promise.all([
        fetch("/api/admin/system-metrics"),
        fetch("/api/admin/performance"),
      ]);

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data.metrics);
      }

      if (perfRes.ok) {
        const data = await perfRes.json();
        setPerformance(data.stats);
      }

      // Получаем URL для Sentry и Grafana из переменных окружения (через API)
      const envRes = await fetch("/api/admin/env");
      if (envRes.ok) {
        const env = await envRes.json();
        if (env.NEXT_PUBLIC_SENTRY_DSN) {
          // Извлекаем organization и project из DSN
          const dsnMatch = env.NEXT_PUBLIC_SENTRY_DSN.match(/https:\/\/([^@]+)@([^/]+)\/(\d+)/);
          if (dsnMatch) {
            const [, key, host, projectId] = dsnMatch;
            setSentryUrl(`https://${host}/organizations/${key.split(".")[0]}/issues/`);
          }
        }
        if (env.GRAFANA_URL) {
          setGrafanaUrl(env.GRAFANA_URL);
        }
      }
    } catch (error) {
      console.error("Error loading monitoring data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка метрик...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Мониторинг системы</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Мониторинг производительности, системных ресурсов и ошибок
        </p>
      </div>

      {/* Внешние сервисы */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {sentryUrl && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sentry</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Мониторинг ошибок и исключений
                </p>
              </div>
              <a
                href={sentryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 transition-colors"
              >
                Открыть Sentry
              </a>
            </div>
          </div>
        )}

        {grafanaUrl && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Grafana</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Визуализация метрик и дашборды
                </p>
              </div>
              <a
                href={grafanaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 transition-colors"
              >
                Открыть Grafana
              </a>
            </div>
          </div>
        )}

        {!sentryUrl && !grafanaUrl && (
          <div className="col-span-2 rounded-lg border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              💡 Для полного мониторинга настройте Sentry и Grafana. См. документацию в MONITORING_IMPLEMENTATION.md
            </p>
          </div>
        )}
      </div>

      {/* Системные метрики */}
      {metrics && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">CPU</p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                  {metrics.cpu.usage.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Load: {metrics.cpu.loadAverage[0].toFixed(2)}
                </p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                metrics.cpu.usage > 80 ? "bg-red-100 dark:bg-red-900/30" :
                metrics.cpu.usage > 50 ? "bg-yellow-100 dark:bg-yellow-900/30" :
                "bg-green-100 dark:bg-green-900/30"
              }`}>
                <svg className="h-6 w-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Память</p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                  {metrics.memory.usage.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                </p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                metrics.memory.usage > 80 ? "bg-red-100 dark:bg-red-900/30" :
                metrics.memory.usage > 50 ? "bg-yellow-100 dark:bg-yellow-900/30" :
                "bg-green-100 dark:bg-green-900/30"
              }`}>
                <svg className="h-6 w-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Диск</p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                  {metrics.disk.usage.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)}
                </p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                metrics.disk.usage > 80 ? "bg-red-100 dark:bg-red-900/30" :
                metrics.disk.usage > 50 ? "bg-yellow-100 dark:bg-yellow-900/30" :
                "bg-green-100 dark:bg-green-900/30"
              }`}>
                <svg className="h-6 w-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">БД соединения</p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                  {metrics.database.connections}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Медленных: {metrics.database.slowQueries}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Redis метрики */}
      {metrics && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Redis</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Статус</p>
              <p className={`mt-1 text-lg font-semibold ${
                metrics.redis.connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}>
                {metrics.redis.connected ? "Подключен" : "Отключен"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Память</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {formatBytes(metrics.redis.memory)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Ключей</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {metrics.redis.keys.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Производительность API */}
      {performance && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Производительность API</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Всего запросов</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {performance.total.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Среднее время</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {performance.average}ms
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Медленных</p>
              <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
                {performance.slow} ({performance.slowPercentage}%)
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Cache Hit Rate</p>
              <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
                {performance.cacheHitRate.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Топ медленных эндпоинтов */}
          {Object.keys(performance.byEndpoint).length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">По эндпоинтам</h3>
              <div className="space-y-2">
                {Object.entries(performance.byEndpoint)
                  .sort((a, b) => b[1].average - a[1].average)
                  .slice(0, 5)
                  .map(([endpoint, stats]) => (
                    <div key={endpoint} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{endpoint}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {stats.count} запросов • Cache: {stats.cacheHitRate.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${
                          stats.average > 500 ? "text-red-600 dark:text-red-400" :
                          stats.average > 200 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-green-600 dark:text-green-400"
                        }`}>
                          {Math.round(stats.average)}ms
                        </p>
                        {stats.slow > 0 && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {stats.slow} медленных
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ссылки на другие разделы */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/admin/logs"
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Логи системы</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Просмотр всех логов и ошибок
              </p>
            </div>
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link
          href="/admin/performance"
          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Детальная статистика</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Подробная статистика производительности
              </p>
            </div>
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>
    </div>
  );
}

