"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, XCircle, Activity, Server, Database, Clock, ExternalLink } from "lucide-react";
import styles from "./monitoring.module.css";

interface SystemMetrics {
  status: "online" | "offline" | "error";
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
    process: number;
  };
  cpu: number;
  restarts: number;
  responseTime: number;
  nodeVersion?: string;
  platform?: string;
  hostname?: string;
}

interface ApiHealth {
  endpoint: string;
  status: number;
  time: number;
  healthy: boolean;
}

export default function MonitoringPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "grafana">("overview");
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Обновление каждые 30 секунд
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch("/api/admin/monitoring");
      const data = await response.json();
      
      if (data.success) {
        setMetrics(data.metrics);
        setApiHealth(data.apiHealth || []);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}д ${hours}ч`;
    if (hours > 0) return `${hours}ч ${minutes}м`;
    return `${minutes}м`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Мониторинг системы</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {activeTab === "overview" && `Обновлено: ${lastUpdate.toLocaleTimeString("ru-RU")}`}
            {activeTab === "grafana" && "Полный мониторинг через Grafana"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "overview" && (
            <button
              onClick={fetchMetrics}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? "Обновление..." : "Обновить"}
            </button>
          )}
          {activeTab === "grafana" && (
            <a
              href="/grafana/d/myunion-overview"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Открыть в новой вкладке
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "overview"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Обзор
          </button>
          <button
            onClick={() => setActiveTab("grafana")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "grafana"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Grafana Dashboard
          </button>
        </nav>
      </div>

      {/* Grafana Tab */}
      {activeTab === "grafana" && (
        <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm ${styles.grafanaContainer}`}>
          <iframe
            src="/grafana/d/myunion-overview?kiosk=tv&theme=dark"
            className="w-full h-full border-0"
            title="Grafana Dashboard"
            allow="fullscreen"
          />
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <>
      {isLoading && !metrics ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-600 dark:text-gray-400">Загрузка метрик...</div>
        </div>
      ) : metrics ? (
        <>
          {/* System Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 shadow-sm min-w-0 overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Статус</p>
                  <p className="text-2xl font-bold mt-1 flex items-center gap-2">
                    {metrics.status === "online" ? (
                      <>
                        <CheckCircle className="w-6 h-6 text-green-500" />
                        <span className="text-green-600 dark:text-green-400">Онлайн</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-6 h-6 text-red-500" />
                        <span className="text-red-600 dark:text-red-400">Офлайн</span>
                      </>
                    )}
                  </p>
                </div>
                <Server className="w-8 h-8 text-gray-400" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 shadow-sm min-w-0 overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Время работы</p>
                  <p className="text-2xl font-bold mt-1 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-400" />
                    {formatUptime(metrics.uptime)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 shadow-sm min-w-0 overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Память</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                  </p>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div
                      ref={(el) => {
                        if (el) el.style.setProperty("--memory-pct", `${metrics.memory.percentage}%`);
                      }}
                      className={`h-2 rounded-full ${styles.memoryBarFill} ${
                        metrics.memory.percentage > 80
                          ? "bg-red-500"
                          : metrics.memory.percentage > 60
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {metrics.memory.percentage.toFixed(1)}%
                  </p>
                </div>
                <Database className="w-8 h-8 text-gray-400" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 shadow-sm min-w-0 overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">CPU</p>
                  <p className="text-2xl font-bold mt-1 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-gray-400" />
                    {metrics.cpu.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* API Health */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 lg:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Проверка API
            </h2>
            <div className="space-y-2">
              {apiHealth.map((health) => (
                <div
                  key={health.endpoint}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {health.healthy ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                      {health.endpoint}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-sm font-medium ${
                        health.status === 200
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {health.status}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {health.time.toFixed(0)}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Дополнительная информация
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Перезапусков</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {metrics.restarts}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Время ответа</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {metrics.responseTime.toFixed(0)}ms
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Память процесса</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {formatBytes(metrics.memory.process || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Node.js</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {metrics.nodeVersion || "N/A"}
                </p>
              </div>
            </div>
            {metrics.platform && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium">Сервер:</span> {metrics.hostname} • {metrics.platform}
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-800 dark:text-red-200">
              Не удалось загрузить метрики. Проверьте подключение к серверу.
            </p>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
