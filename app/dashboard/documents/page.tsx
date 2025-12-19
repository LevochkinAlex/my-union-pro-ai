"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { alertError, alertSuccess, alertWarning, confirm } from "@/lib/alert";
import PPOHeadDocumentsPage from "./ppo-head/page";

interface Document {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string;
  filePath: string | null;
  signedFilePath: string | null;
  driveFileId: string | null;
  driveUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function DocumentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  // Все hooks должны быть объявлены ДО любых условных return
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileChanged, setProfileChanged] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regeneratingDocId, setRegeneratingDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  
  const isPPOHead = session?.user?.role === "PPO_HEAD";

  // Функции загрузки данных вынесены из useEffect для повторного использования
  const loadProfileStatus = async () => {
    try {
      const response = await fetch("/api/profile");
      if (response.ok) {
        const data = await response.json();
        setProfileChanged(data.user?.profileChangedAfterDocuments || false);
      }
    } catch (err) {
      console.error("Ошибка загрузки статуса профиля:", err);
    }
  };

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/documents");
      if (!response.ok) {
        throw new Error("Ошибка загрузки документов");
      }

      const data = await response.json();
      // Фильтруем документы: скрываем только загруженные пользователем документы типа OTHER
      // (но оставляем системный документ - устав, который всегда доступен)
      const filteredDocuments = (data.documents || []).filter((doc: Document) => {
        // Показываем все документы, кроме загруженных пользователем OTHER документов
        if (doc.type === "OTHER") {
          // Показываем устав (системный документ) - он всегда должен быть доступен
          const isCharter = 
            doc.id === "charter-system" ||
            doc.title?.toLowerCase().includes("устав") ||
            doc.description?.toLowerCase().includes("устав");
          
          // Скрываем только загруженные пользователем файлы (имеют путь в /uploads/documents/)
          const isUploadedFile = doc.filePath?.startsWith("/uploads/documents/");
          
          // Показываем устав, скрываем только загруженные пользователем
          return isCharter || !isUploadedFile;
        }
        return true;
      });
      setDocuments(filteredDocuments);
    } catch (err) {
      console.error("Ошибка загрузки документов:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить документы");
    } finally {
      setIsLoading(false);
    }
  };

  // useEffect должен быть ДО условного return (правила хуков React)
  useEffect(() => {
    // Не загружаем данные для PPO_HEAD - у них своя страница
    if (!isPPOHead) {
      loadDocuments();
      loadProfileStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPPOHead]);
  
  // Если пользователь - Председатель, показываем специальную страницу
  if (isPPOHead) {
    return <PPOHeadDocumentsPage />;
  }

  const handleRegenerateDocuments = async () => {
    const confirmed = await confirm("Вы уверены, что хотите переформировать документы? Старые документы будут заменены.", "Подтвердите переформирование");
    if (!confirmed) {
      return;
    }

    try {
      setIsRegenerating(true);
      setError(null);

      const response = await fetch("/api/documents/regenerate", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка перегенерации документов");
      }

      // Перезагружаем документы и статус профиля
      await loadDocuments();
      await loadProfileStatus();

      alertSuccess("Документы успешно переформированы! Проверьте их и скачайте обновленные версии.");
    } catch (err) {
      console.error("Ошибка перегенерации:", err);
      setError(err instanceof Error ? err.message : "Не удалось переформировать документы");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRegenerateSingleDocument = async (docId: string, docType: string) => {
    const confirmed = await confirm(
      "Вы уверены, что хотите переформировать документы? Оба заявления будут переформированы с актуальными данными.",
      "Подтвердите переформирование"
    );
    if (!confirmed) {
      return;
    }

    try {
      setRegeneratingDocId(docId);
      setError(null);

      // Используем API генерации, который генерирует оба документа
      const response = await fetch("/api/documents/generate", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.details || "Ошибка перегенерации документов");
      }

      // Перезагружаем документы
      await loadDocuments();
      await loadProfileStatus();

      alertSuccess("Документы успешно переформированы!");
    } catch (err) {
      console.error("Ошибка переформирования:", err);
      alertError(err instanceof Error ? err.message : "Не удалось переформировать документы");
    } finally {
      setRegeneratingDocId(null);
    }
  };

  const handleDownload = async (docId: string, fileName: string | null) => {
    try {
      // Кодируем ID для безопасной передачи в URL
      const encodedId = encodeURIComponent(docId);
      console.log("[documents] Downloading document:", { docId, encodedId, fileName });
      const response = await fetch(`/api/documents/${encodedId}/download`);
      
      if (!response.ok) {
        // Пытаемся получить сообщение об ошибке из JSON
        let errorMessage = "Ошибка скачивания документа";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          }
        } catch (e) {
          console.error("Не удалось прочитать ошибку:", e);
        }
        throw new Error(errorMessage);
      }

      // Проверяем, что ответ действительно содержит файл
      const contentType = response.headers.get("content-type");
      if (!contentType || (!contentType.includes("application/pdf") && 
          !contentType.includes("application/vnd.openxmlformats") && 
          !contentType.includes("application/msword") &&
          !contentType.includes("application/octet-stream"))) {
        // Если это не файл, пытаемся прочитать как JSON (ошибка)
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || "Неверный тип ответа от сервера");
        } catch (e) {
          if (e instanceof Error && e.message.includes("Неверный тип")) {
            throw e;
          }
        }
      }

      const blob = await response.blob();
      
      // Проверяем, что blob не пустой
      if (blob.size === 0) {
        throw new Error("Получен пустой файл");
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document.pdf";
      document.body.appendChild(a);
      a.click();
      
      // Небольшая задержка перед очисткой, чтобы браузер успел начать скачивание
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } catch (err) {
      console.error("Ошибка скачивания:", err);
      const errorMessage = err instanceof Error ? err.message : "Не удалось скачать документ";
      alertError(errorMessage);
    }
  };

  const handleUploadSigned = async (docId: string, file: File) => {
    try {
      setUploadProgress({ [docId]: 0 });

      // Симуляция прогресса
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          const current = prev[docId] || 0;
          if (current < 90) {
            return { [docId]: current + 10 };
          }
          return prev;
        });
      }, 100);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentId', docId);

      const response = await fetch('/api/documents/upload-signed', {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка загрузки");
      }

      setUploadProgress({ [docId]: 100 });
      
      setTimeout(() => {
        setUploadProgress(prev => {
          const newState = { ...prev };
          delete newState[docId];
          return newState;
        });
        loadDocuments(); // Перезагружаем список
      }, 1000);

    } catch (err) {
      console.error("Ошибка загрузки:", err);
      alertError(err instanceof Error ? err.message : "Не удалось загрузить документ");
      setUploadProgress(prev => {
        const newState = { ...prev };
        delete newState[docId];
        return newState;
      });
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
      GENERATED: "Сформировано",
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
    <div className="w-full max-w-full space-y-6 md:space-y-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">Мои документы</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 md:text-base">
          Здесь хранятся все ваши документы: заявления, обращения и другие файлы
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Баннер об изменении профиля */}
      {profileChanged && (
        <div className="mb-6 rounded-lg border-2 border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-900/20">
          <div className="p-4 md:p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-orange-900 dark:text-orange-200 md:text-lg">
                  Вы изменили данные профиля
                </h3>
                  <p className="mt-2 text-sm text-orange-800 dark:text-orange-300">
                  Обнаружены изменения в ваших личных данных (ФИО, дата рождения, адрес, должность и т.д.), которые влияют на содержимое документов. 
                  Рекомендуем переформировать документы, чтобы они соответствовали актуальным данным.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    onClick={handleRegenerateDocuments}
                    disabled={isRegenerating}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRegenerating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Переформирование...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Переформировать документы
                      </>
                    )}
                  </button>
                  <a
                    href="/dashboard/profile"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-orange-300 bg-white dark:bg-gray-800 dark:border-orange-700 px-4 py-2.5 text-sm font-medium text-orange-900 dark:text-orange-200 transition-colors hover:bg-orange-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Проверить профиль
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800 md:p-12">
          <svg
            className="mx-auto h-10 w-10 text-gray-400 md:h-12 md:w-12"
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
          <h3 className="mt-4 text-base font-medium text-gray-900 dark:text-white md:text-lg">
            Документов пока нет
          </h3>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 md:text-sm">
            Заполните профиль через AI чат, чтобы система сформировала ваши заявления
          </p>
        </div>
      ) : (
        <div className="grid gap-4 w-full max-w-full">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="w-full max-w-full rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 sm:p-4 md:p-6 overflow-hidden"
            >
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white sm:text-base md:text-lg break-words">
                      {doc.title}
                    </h3>
                    {getStatusBadge(doc.status)}
                  </div>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                    {getTypeLabel(doc.type)}
                  </p>
                  {doc.description && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 sm:text-sm break-words">
                      {doc.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 sm:mt-4 sm:flex-row sm:flex-wrap sm:gap-2 md:gap-4">
                    <span className="whitespace-nowrap">Создан: {formatDate(doc.createdAt)}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="whitespace-nowrap">Размер: {formatFileSize(doc.fileSize)}</span>
                    {doc.fileName && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="truncate break-all sm:break-normal">{doc.fileName}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  {/* Кнопка скачивания - показываем для всех документов со статусом GENERATED или для устава */}
                  {(doc.status === "GENERATED" || doc.id === "charter-system" || doc.filePath) && (
                    <button
                      onClick={() => handleDownload(doc.id, doc.fileName)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto sm:px-4"
                    >
                      <svg
                        className="h-4 w-4 flex-shrink-0"
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
                      <span>Скачать</span>
                    </button>
                  )}
                  {/* Кнопка перегенерации для заявлений */}
                  {(doc.type === "MEMBERSHIP_APPLICATION" || doc.type === "CONTRIBUTION_APPLICATION") && (
                    <button
                      onClick={() => handleRegenerateSingleDocument(doc.id, doc.type)}
                      disabled={regeneratingDocId === doc.id}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 sm:w-auto sm:px-4"
                    >
                      {regeneratingDocId === doc.id ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
                          <span>Формирование...</span>
                        </>
                      ) : (
                        <>
                          <svg
                            className="h-4 w-4 flex-shrink-0"
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
                          <span className="hidden sm:inline">Сформировать повторно</span>
                          <span className="sm:hidden">Переформировать</span>
                        </>
                      )}
                    </button>
                  )}
                  {/* Кнопка загрузки подписанного для GENERATED документов */}
                  {(doc.status === 'GENERATED' || doc.status === 'SIGNED') && 
                   (doc.type === 'MEMBERSHIP_APPLICATION' || doc.type === 'CONTRIBUTION_APPLICATION') && (
                    <div className="relative w-full sm:w-auto">
                      {uploadProgress[doc.id] !== undefined ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-purple-600 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 sm:px-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"></div>
                          <span className="text-sm text-purple-700 dark:text-purple-300">
                            {uploadProgress[doc.id]}%
                          </span>
                        </div>
                      ) : (
                        <label className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 cursor-pointer sm:w-auto sm:px-4">
                          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="whitespace-nowrap">Загрузить подписанный</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 50 * 1024 * 1024) {
                                  alert("Файл слишком большой. Максимальный размер: 50 МБ");
                                  return;
                                }
                                handleUploadSigned(doc.id, file);
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  {doc.signedFilePath && (doc.status === 'SIGNED' || doc.status === 'PENDING' || doc.status === 'APPROVED') && (
                    <button
                      onClick={async () => {
                        // Скачиваем подписанный файл
                        try {
                          const response = await fetch(`/api/documents/${doc.id}/download?signed=true`);
                          if (!response.ok) {
                            throw new Error("Ошибка скачивания документа");
                          }

                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          const signedFileName = doc.fileName ? `подписанное_${doc.fileName}` : "подписанное_заявление.pdf";
                          a.download = signedFileName;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        } catch (err) {
                          console.error("Ошибка скачивания:", err);
                          alertError("Не удалось скачать подписанное заявление");
                        }
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 sm:w-auto sm:px-4"
                    >
                      <svg
                        className="h-4 w-4 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="hidden sm:inline">Скачать подписанное</span>
                      <span className="sm:hidden">Подписанное</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

