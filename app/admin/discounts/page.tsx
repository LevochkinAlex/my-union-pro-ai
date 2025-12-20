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

export default function AdminDiscountsPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
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
        await fetchStatus(); // Обновляем статус
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

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}мс`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}с`;
    return `${Math.floor(ms / 60000)}м ${Math.round((ms % 60000) / 1000)}с`;
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

      {/* Sync Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Синхронизация с BestBenefits
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Загрузить все скидки из BestBenefits API, конвертировать изображения в CDN и сохранить локально
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

      {/* Info Card */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="font-semibold text-blue-700 dark:text-blue-300">
          💡 Как это работает
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-600 dark:text-blue-400">
          <li>• Все скидки загружаются из BestBenefits API</li>
          <li>• Base64 изображения конвертируются и загружаются на CDN</li>
          <li>• Описания очищаются от HTML-мусора (жирные точки и т.д.)</li>
          <li>• Категории и города синхронизируются автоматически</li>
          <li>• Скидки, которых больше нет в BB, помечаются неактивными</li>
          <li>• Рекомендуется запускать синхронизацию раз в день</li>
        </ul>
      </div>
    </div>
  );
}

