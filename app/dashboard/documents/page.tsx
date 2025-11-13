"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface Document {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string;
  driveFileId: string | null;
  driveUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function DocumentsPage() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/documents");
      if (!response.ok) {
        throw new Error("Ошибка загрузки документов");
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error("Ошибка загрузки документов:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить документы");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (docId: string, fileName: string | null) => {
    try {
      const response = await fetch(`/api/documents/${docId}/download`);
      if (!response.ok) {
        throw new Error("Ошибка скачивания документа");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Ошибка скачивания:", err);
      alert("Не удалось скачать документ");
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
      GENERATED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      SIGNED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      APPROVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      REJECTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    };

    const labels = {
      DRAFT: "Черновик",
      GENERATED: "Сгенерирован",
      SIGNED: "Подписан",
      PENDING: "На проверке",
      APPROVED: "Одобрен",
      REJECTED: "Отклонен",
      ARCHIVED: "В архиве",
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          styles[status as keyof typeof styles] || styles.DRAFT
        }`}
      >
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      MEMBERSHIP_APPLICATION: "Заявление о вступлении",
      CONTRIBUTION_APPLICATION: "Заявление о взносах",
      APPEAL: "Обращение",
      OTHER: "Прочее",
    };
    return labels[type as keyof typeof labels] || type;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка документов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Мои документы</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Здесь хранятся все ваши документы: заявления, обращения и другие файлы
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Документов пока нет
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Заполните профиль через AI чат, чтобы система сгенерировала ваши заявления
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {doc.title}
                    </h3>
                    {getStatusBadge(doc.status)}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {getTypeLabel(doc.type)}
                  </p>
                  {doc.description && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {doc.description}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Создан: {formatDate(doc.createdAt)}</span>
                    <span>•</span>
                    <span>Размер: {formatFileSize(doc.fileSize)}</span>
                    {doc.fileName && (
                      <>
                        <span>•</span>
                        <span>{doc.fileName}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="ml-4 flex gap-2">
                  <button
                    onClick={() => handleDownload(doc.id, doc.fileName)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
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
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Скачать
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

