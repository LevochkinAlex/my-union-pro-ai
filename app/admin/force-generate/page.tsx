"use client";

import { useState } from "react";
import Link from "next/link";

interface GenerateResult {
  userId: string;
  email: string;
  status: "success" | "error" | "skipped";
  documentsGenerated?: number;
  reason?: string;
  error?: string;
}

export default function ForceGeneratePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleGenerateDocuments = async () => {
    if (!confirm("Вы уверены? Это займёт некоторое время и будет генерировать документы для всех пользователей с полным профилем.")) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage(null);
      setResults([]);

      const response = await fetch("/api/admin/force-generate-documents", {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при генерации документов");
      }

      const data = await response.json();
      setResults(data.results || []);
      setMessage({
        type: "success",
        text: data.message || "Документы успешно сгенерированы",
      });
    } catch (error) {
      console.error("Error:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ошибка при генерации документов",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/users" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
          ← Назад к пользователям
        </Link>
      </div>

      <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">Принудительная генерация документов</h1>
      <p className="mb-6 text-gray-600 dark:text-gray-400">
        Сгенерирует PDF заявления для всех пользователей с полным профилем
      </p>

      {message && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm shadow-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-6">
        <button
          onClick={handleGenerateDocuments}
          disabled={isLoading}
          className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? "Генерация..." : "Начать генерацию"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-900/20">
              <p className="text-sm text-green-600 dark:text-green-400">Успешно</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-200">{successCount}</p>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/40 dark:bg-yellow-900/20">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">Пропущено</p>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-200">{skippedCount}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
              <p className="text-sm text-red-600 dark:text-red-400">Ошибок</p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-200">{errorCount}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Детали</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Email</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Статус</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={index} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{result.email}</td>
                      <td className="px-4 py-2">
                        {result.status === "success" && (
                          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200">
                            Успешно
                          </span>
                        )}
                        {result.status === "error" && (
                          <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200">
                            Ошибка
                          </span>
                        )}
                        {result.status === "skipped" && (
                          <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                            Пропущено
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                        {result.status === "success" && `${result.documentsGenerated} документов создано`}
                        {result.status === "error" && result.error}
                        {result.status === "skipped" && result.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

