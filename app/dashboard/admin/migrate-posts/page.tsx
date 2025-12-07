"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function MigratePostsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runMigration = async (action: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/migrate-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ошибка выполнения");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          ← Назад
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          🔄 Миграция постов
        </h1>

        <div className="space-y-4">
          {/* Статистика */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              📊 Статистика
            </h2>
            <button
              onClick={() => runMigration("stats")}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Загрузка..." : "Показать статистику"}
            </button>
          </div>

          {/* Список статей */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              📄 Список статей
            </h2>
            <button
              onClick={() => runMigration("list-articles")}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Загрузка..." : "Показать статьи"}
            </button>
          </div>

          {/* Конвертация */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              🔄 Конвертация в статьи
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Конвертирует посты с длинным контентом (&gt;500 символов) или HTML разметкой в тип &quot;article&quot;
            </p>
            <button
              onClick={() => runMigration("convert-to-article")}
              disabled={loading}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? "Выполнение..." : "Конвертировать посты в статьи"}
            </button>
          </div>

          {/* Результат */}
          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 px-4 py-3 rounded">
              ❌ {error}
            </div>
          )}

          {result && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                ✅ Результат
              </h2>
              <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded overflow-auto text-sm text-gray-800 dark:text-gray-200">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

