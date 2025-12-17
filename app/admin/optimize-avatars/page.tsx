"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OptimizeAvatarsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/admin/optimize-avatars");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleOptimize = async () => {
    if (!confirm("Начать оптимизацию всех аватаров? Это может занять некоторое время.")) {
      return;
    }

    setProcessing(true);
    setResults([]);
    setOffset(0);

    let currentOffset = 0;
    let hasMore = true;
    const allResults: any[] = [];

    while (hasMore) {
      try {
        setLoading(true);
        const response = await fetch("/api/admin/optimize-avatars", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            offset: currentOffset,
            batchSize: 10,
          }),
        });

        if (!response.ok) {
          throw new Error("Ошибка при оптимизации");
        }

        const data = await response.json();
        allResults.push(data.results);
        setResults([...allResults]);
        setOffset(data.offset);
        currentOffset = data.offset;
        hasMore = data.hasMore;

        // Обновляем статистику
        await loadStats();

        // Небольшая задержка между батчами
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error: any) {
        alert(`Ошибка: ${error.message}`);
        break;
      } finally {
        setLoading(false);
      }
    }

    setProcessing(false);
    alert("Оптимизация завершена!");
  };

  const totalProcessed = results.reduce((sum, r) => sum + (r.processed || 0), 0);
  const totalOptimized = results.reduce((sum, r) => sum + (r.optimized || 0), 0);
  const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0);
  const totalSkipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0);
  const totalSizeBefore = results.reduce((sum, r) => sum + (parseFloat(r.totalSizeBeforeMB || 0) * 1024 * 1024), 0);
  const totalSizeAfter = results.reduce((sum, r) => sum + (parseFloat(r.totalSizeAfterMB || 0) * 1024 * 1024), 0);
  const totalSavings = totalSizeBefore > 0
    ? ((totalSizeBefore - totalSizeAfter) / totalSizeBefore * 100).toFixed(1)
    : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Оптимизация аватаров пользователей
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Сжатие и конвертация всех аватаров в WebP формат для экономии места
        </p>
      </div>

      {stats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Статистика
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Всего пользователей с аватарами</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Уже оптимизировано</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.optimized}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Data URLs</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.dataUrls}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Требуют оптимизации</div>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.needsOptimization}</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Оптимизация
          </h2>
          <button
            onClick={handleOptimize}
            disabled={processing || loading || !stats || stats.needsOptimization === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? "Обработка..." : "Начать оптимизацию"}
          </button>
        </div>

        {processing && (
          <div className="mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Обработано: {offset} из {stats?.needsOptimization || 0}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${stats ? (offset / stats.needsOptimization * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Результаты
            </h3>
            <div className="space-y-4">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Обработано:</span>{" "}
                      <span className="font-semibold">{result.processed}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Оптимизировано:</span>{" "}
                      <span className="font-semibold text-green-600">{result.optimized}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Пропущено:</span>{" "}
                      <span className="font-semibold">{result.skipped}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Ошибки:</span>{" "}
                      <span className="font-semibold text-red-600">{result.errors}</span>
                    </div>
                    {result.savings && (
                      <div className="col-span-2 md:col-span-4">
                        <span className="text-gray-500 dark:text-gray-400">Экономия:</span>{" "}
                        <span className="font-semibold text-green-600">{result.savings}%</span>
                        {" "}
                        <span className="text-gray-500 dark:text-gray-400">
                          ({result.totalSizeBeforeMB} MB → {result.totalSizeAfterMB} MB)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalProcessed > 0 && (
              <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Итого:
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Обработано:</span>{" "}
                    <span className="font-semibold">{totalProcessed}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Оптимизировано:</span>{" "}
                    <span className="font-semibold text-green-600">{totalOptimized}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Пропущено:</span>{" "}
                    <span className="font-semibold">{totalSkipped}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Ошибки:</span>{" "}
                    <span className="font-semibold text-red-600">{totalErrors}</span>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <span className="text-gray-500 dark:text-gray-400">Общая экономия:</span>{" "}
                    <span className="font-semibold text-green-600">{totalSavings}%</span>
                    {" "}
                    <span className="text-gray-500 dark:text-gray-400">
                      ({(totalSizeBefore / 1024 / 1024).toFixed(2)} MB → {(totalSizeAfter / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

