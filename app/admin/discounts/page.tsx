"use client";

import { useState, useEffect } from "react";

interface SyncStatus {
  totalDiscounts: number;
  activeDiscounts: number;
  categoriesCount: number;
  lastSyncedAt: string | null;
}

interface SyncResult {
  success: boolean;
  synced: number;
  updated: number;
  created: number;
  imagesProcessed: number;
  errors: string[];
  duration: number;
}

interface SyncLogEntry {
  id: string;
  type: string;
  source: string;
  status: string;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  duration: number;
  createdAt: string;
}

export default function AdminDiscountsPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    fetchStatus();
    fetchSyncLogs();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/discounts/sync-all");
      if (!response.ok) {
        throw new Error("Не удалось загрузить статус");
      }
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      setLoadingLogs(true);
      const response = await fetch("/api/admin/sync-logs?type=DISCOUNTS&limit=10");
      if (response.ok) {
        const data = await response.json();
        setSyncLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch sync logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;

    try {
      setSyncing(true);
      setError(null);
      setSyncResult(null);

      const response = await fetch("/api/discounts/sync-all", {
        method: "POST",
      });

      const data = await response.json();
      setSyncResult(data);

      if (data.success) {
        await fetchStatus();
        await fetchSyncLogs();
      } else {
        setError(data.errors?.join(", ") || "Синхронизация не удалась");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Никогда";
    return new Date(dateStr).toLocaleString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}мс`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}с`;
    return `${Math.floor(ms / 60000)}м ${Math.round((ms % 60000) / 1000)}с`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            ✓ Успешно
          </span>
        );
      case "PARTIAL":
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            ⚠ Частично
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            ✕ Ошибка
          </span>
        );
      default:
        return null;
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "CRON":
        return (
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            🕐 Авто
          </span>
        );
      case "MANUAL":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            👤 Ручная
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Управление скидками
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Синхронизация скидок с BestBenefits и управление локальным хранилищем
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Status Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Статус хранилища
        </h2>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
            Загрузка...
          </div>
        ) : status ? (
          <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {status.totalDiscounts}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Всего скидок
              </p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {status.activeDiscounts}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Активных
              </p>
            </div>
            <div>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {status.categoriesCount}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Категорий
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Последняя синхронизация
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatDate(status.lastSyncedAt)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-gray-500">Данные недоступны</p>
        )}
      </div>

      {/* Auto Sync Status */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-green-800 dark:text-green-200">
              Автоматическая синхронизация активна
            </h3>
            <p className="text-sm text-green-600 dark:text-green-400">
              Скидки обновляются автоматически каждый день в 03:00 по Москве
            </p>
          </div>
        </div>
      </div>

      {/* Manual Sync Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Ручная синхронизация
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Запустить синхронизацию вручную, если нужно обновить скидки прямо сейчас
        </p>

        <div className="mt-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              syncing
                ? "cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {syncing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Синхронизация...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Запустить синхронизацию
              </>
            )}
          </button>
        </div>

        {/* Sync Result */}
        {syncResult && (
          <div
            className={`mt-4 rounded-lg border p-4 ${
              syncResult.success
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {syncResult.success ? (
                <svg
                  className="h-5 w-5 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              <span
                className={`font-medium ${
                  syncResult.success
                    ? "text-green-700 dark:text-green-300"
                    : "text-red-700 dark:text-red-300"
                }`}
              >
                {syncResult.success ? "Синхронизация завершена" : "Ошибка синхронизации"}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                ({formatDuration(syncResult.duration)})
              </span>
            </div>

            {syncResult.success && (
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {syncResult.synced}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Обработано
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {syncResult.created}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Создано
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {syncResult.updated}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Обновлено
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {syncResult.imagesProcessed}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Изображений
                  </p>
                </div>
              </div>
            )}

            {syncResult.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Ошибки ({syncResult.errors.length}):
                </p>
                <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-red-600 dark:text-red-400">
                  {syncResult.errors.slice(0, 10).map((err, i) => (
                    <li key={i} className="truncate">
                      • {err}
                    </li>
                  ))}
                  {syncResult.errors.length > 10 && (
                    <li>... и ещё {syncResult.errors.length - 10} ошибок</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync History */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          История синхронизаций
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Последние 10 синхронизаций (автоматические и ручные)
        </p>

        {loadingLogs ? (
          <div className="mt-4 flex items-center gap-2 text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
            Загрузка...
          </div>
        ) : syncLogs.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            История синхронизаций пока пуста
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2">Тип</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Создано</th>
                  <th className="px-3 py-2">Обновлено</th>
                  <th className="px-3 py-2">Ошибок</th>
                  <th className="px-3 py-2">Время</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm dark:divide-gray-700">
                {syncLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
                      {formatShortDate(log.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {getSourceBadge(log.source)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-blue-600 dark:text-blue-400">
                      +{log.itemsCreated}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-yellow-600 dark:text-yellow-400">
                      ~{log.itemsUpdated}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-red-600 dark:text-red-400">
                      {log.itemsFailed > 0 ? log.itemsFailed : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500 dark:text-gray-400">
                      {formatDuration(log.duration)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="font-semibold text-blue-700 dark:text-blue-300">
          💡 Как работает синхронизация
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-600 dark:text-blue-400">
          <li>• <strong>Автоматически:</strong> Cron запускает синхронизацию каждый день в 03:00</li>
          <li>• Все скидки загружаются из BestBenefits API</li>
          <li>• Base64 изображения конвертируются и загружаются на CDN</li>
          <li>• Описания очищаются от HTML-мусора (жирные точки и т.д.)</li>
          <li>• Категории и города синхронизируются автоматически</li>
          <li>• Скидки, которых больше нет в BB, помечаются неактивными</li>
        </ul>
      </div>
    </div>
  );
}
