"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForceGeneratePage() {
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateForUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) {
      setError("Пожалуйста, введите ID пользователя");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/generate-user-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ошибка при генерации документов");
        setResult(data);
      } else {
        setResult(data);
        setUserId("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при генерации документов");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateForAll = async () => {
    if (!confirm("Это будет генерировать документы для ВСЕх пользователей с полным профилем. Продолжить?")) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/generate-user-documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Ошибка при генерации документов");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при генерации документов");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="mb-6">
        <Link href="/admin/users" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
          ← Назад к пользователям
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Генерация документов</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Принудительно сгенерировать PDF заявления для пользователей
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Generate for Single User */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Генерация для одного пользователя
          </h2>

          <form onSubmit={handleGenerateForUser} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ID пользователя
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="cmhwc73qe000jp10e4mrgcejr"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Генерация..." : "Сгенерировать"}
            </button>
          </form>
        </div>

        {/* Generate for All Users */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Генерация для всех пользователей
          </h2>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Сгенерировать документы для всех пользователей с полным профилем, у которых ещё нет документов.
          </p>

          <button
            onClick={handleGenerateForAll}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Обработка..." : "Сгенерировать для всех"}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">
            <strong>Ошибка:</strong> {error}
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {result.results ? "Результаты генерации" : "Результат"}
          </h3>

          {result.results ? (
            // Bulk results
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {result.results.total}
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300">Всего пользователей</div>
                </div>
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {result.results.generated}
                  </div>
                  <div className="text-xs text-green-700 dark:text-green-300">Сгенерировано</div>
                </div>
                <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {result.results.skipped}
                  </div>
                  <div className="text-xs text-yellow-700 dark:text-yellow-300">Пропущено</div>
                </div>
                <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {result.results.errors}
                  </div>
                  <div className="text-xs text-red-700 dark:text-red-300">Ошибок</div>
                </div>
              </div>

              {/* Details table */}
              {result.results.details && result.results.details.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                          Email
                        </th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                          Статус
                        </th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700 dark:text-gray-300">
                          Детали
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.details.map((detail: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-2 px-2 text-gray-600 dark:text-gray-400">
                            {detail.email}
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                detail.status === "generated"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                  : detail.status === "skipped"
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              }`}
                            >
                              {detail.status}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-gray-600 dark:text-gray-400 text-xs">
                            {detail.reason || detail.error || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            // Single user result
            <div className="space-y-4">
              {result.success ? (
                <>
                  <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      ✅ {result.message}
                    </p>
                  </div>

                  {result.user && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        <div>
                          <strong>Пользователь:</strong> {result.user.name} ({result.user.email})
                        </div>
                      </div>
                    </div>
                  )}

                  {result.documents && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">Сгенерированные документы:</h4>
                      {result.documents.map((doc: any) => (
                        <div key={doc.id} className="text-sm text-gray-600 dark:text-gray-400">
                          ✓ {doc.title}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    ❌ {result.error}
                  </p>
                  {result.profile && (
                    <div className="mt-2 text-xs text-red-700 dark:text-red-300">
                      <strong>Отсутствующие поля:</strong>
                      <ul className="mt-1 list-inside list-disc">
                        {Object.entries(result.profile.fields).map(([field, filled]: any) =>
                          !filled ? <li key={field}>{field}</li> : null
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

