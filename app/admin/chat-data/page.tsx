"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";

type Feedback = {
  type: "success" | "error";
  text: string;
};

type TrainingStats = {
  count: number;
  latestUpload: {
    createdAt: string;
    sourceFileName: string | null;
    uploadedBy: string | null;
  } | null;
};

const INITIAL_STATS: TrainingStats = {
  count: 0,
  latestUpload: null,
};

export default function AdminChatData() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<Feedback | null>(null);
  const [stats, setStats] = useState<TrainingStats>(INITIAL_STATS);
  const [loadingStats, setLoadingStats] = useState(true);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const response = await fetch("/api/admin/chat-data/stats");
      if (!response.ok) {
        throw new Error("Не удалось загрузить статистику");
      }
      const data = await response.json();
      setStats({
        count: data.count ?? 0,
        latestUpload: data.latestUpload ?? null,
      });
    } catch (error) {
      console.error("[admin/chat-data] load stats", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Не удалось загрузить статистику",
      });
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      alert("Пожалуйста, выберите файл");
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/chat-data/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? "Не удалось загрузить файл");
      }

      const result = await response.json();
      setMessage({
        type: "success",
        text: `Файл загружен. Добавлено записей: ${result.count}.`,
      });
      setFile(null);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) input.value = "";

      loadStats();
    } catch (error) {
      console.error("[admin/chat-data] upload error", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ошибка при загрузке данных",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">
        Данные для обучения AI чата
      </h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Upload Section */}
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            Загрузить данные
          </h2>

          {message && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                message.type === "success"
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
              <label className="cursor-pointer">
                <div className="flex flex-col items-center gap-2">
                  <svg
                    className="h-8 w-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {file ? file.name : "Выберите CSV или JSON файл"}
                  </span>
                </div>
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".csv,.json"
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={uploading || !file}>
                {uploading ? "Загрузка..." : "Загрузить"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFile(null);
                  const input = document.querySelector(
                    'input[type="file"]',
                  ) as HTMLInputElement;
                  if (input) input.value = "";
                }}
              >
                Очистить
              </Button>
            </div>
          </form>

          <div className="mt-6 space-y-3 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100">
              Формат файла:
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              CSV или JSON с колонками:
            </p>
            <ul className="ml-4 list-inside list-disc space-y-1 text-sm text-blue-800 dark:text-blue-200">
              <li>question (вопрос)</li>
              <li>answer (ответ)</li>
              <li>category (категория, опционально)</li>
            </ul>
          </div>
        </div>

        {/* Info Section */}
        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              Статистика данных
            </h2>

            {loadingStats ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Загрузка статистики...
              </p>
            ) : (
              <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40">
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    Всего записей
                  </span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {stats.count}
                  </span>
                </div>

                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Последняя загрузка
                  </h3>
                  {stats.latestUpload ? (
                    <ul className="space-y-2">
                      <li>
                        <span className="text-gray-500">Файл:</span> {stats.latestUpload.sourceFileName ?? "—"}
                      </li>
                      <li>
                        <span className="text-gray-500">Дата:</span> {new Date(stats.latestUpload.createdAt).toLocaleString("ru-RU")}
                      </li>
                      <li>
                        <span className="text-gray-500">Загрузил:</span> {stats.latestUpload.uploadedBy ?? "—"}
                      </li>
                    </ul>
                  ) : (
                    <p>Данные еще не загружались.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              О загрузке данных
            </h2>
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <p>
                Загруженные данные будут использованы для обучения AI-помощника
                при сборе информации о профиле пользователя.
              </p>
              <p>
                Вы можете загружать вопросы и ответы, которые будут помогать
                AI давать более точные и релевантные ответы.
              </p>
              <p>
                Поддерживаются форматы CSV и JSON. Каждая строка должна
                содержать вопрос и соответствующий ответ.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
              Пример CSV
            </h2>
            <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-900">
              {`question,answer,category
Как заполнить анкету?,Анкета заполняется честно и полностью,FAQ
Какие документы нужны?,Паспорт и трудовая книжка,FAQ`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

