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
  verificationStatus: string | null;
  verificationMessage: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string | null;
  sender?: string | null;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
  } | null;
}

export default function DocumentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  // Все hooks должны быть объявлены ДО любых условных return
  const [activeTab, setActiveTab] = useState<"incoming" | "outgoing">("incoming");
  const [incomingDocuments, setIncomingDocuments] = useState<Document[]>([]);
  const [outgoingDocuments, setOutgoingDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileChanged, setProfileChanged] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regeneratingDocId, setRegeneratingDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  
  // Проверяем режим просмотра вместо роли для корректного переключения
  const isPPOHead = session?.user?.viewMode === "PPO_HEAD" || 
    (session?.user?.role === "PPO_HEAD" && !session?.user?.isPPOHead);

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
      
      // Входящие документы: устав + назначенные для ознакомления
      const incoming = (data.incomingDocuments || []).map((doc: any) => ({
        ...doc,
        assignedAt: doc.assignedAt,
        sender: doc.user 
          ? `${doc.user.firstName || ''} ${doc.user.lastName || ''} ${doc.user.middleName || ''}`.trim() 
          : null,
        user: doc.user,
      }));
      
      setIncomingDocuments(incoming);
      
      // Исходящие документы: заявления пользователя (MEMBERSHIP_APPLICATION, CONTRIBUTION_APPLICATION)
      const outgoing = (data.outgoingDocuments || []).filter((doc: Document) => {
        // Показываем только заявления
        return doc.type === "MEMBERSHIP_APPLICATION" || doc.type === "CONTRIBUTION_APPLICATION";
      });
      
      setOutgoingDocuments(outgoing);
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
      await Promise.all([loadDocuments(), loadProfileStatus()]);

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
      await Promise.all([loadDocuments(), loadProfileStatus()]);

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
      
      // Показываем сообщение о начале проверки
      alertSuccess("Заявление загружено и отправлено на проверку");
      
      setTimeout(() => {
        setUploadProgress(prev => {
          const newState = { ...prev };
          delete newState[docId];
          return newState;
        });
        loadDocuments(); // Перезагружаем список
        
        // Запускаем polling для обновления статуса верификации
        pollVerificationStatus(docId);
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

  // Polling для обновления статуса верификации
  const pollVerificationStatus = async (docId: string, attempts = 0) => {
    if (attempts >= 10) return; // Максимум 10 попыток (20 секунд)
    
    setTimeout(async () => {
      await loadDocuments();
      
      // Проверяем статус документа
      const doc = documents.find(d => d.id === docId);
      if (doc?.verificationStatus === "VERIFYING") {
        // Продолжаем polling
        pollVerificationStatus(docId, attempts + 1);
      } else if (doc?.verificationStatus === "VERIFIED") {
        alertSuccess("Заявление предварительно проверено успешно!");
      } else if (doc?.verificationStatus === "FAILED") {
        alertWarning(doc.verificationMessage || "Документ не прошёл проверку");
      }
    }, 2000);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      DRAFT: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
      GENERATED: "bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      SIGNED: "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300",
      PENDING: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      APPROVED: "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300",
      REJECTED: "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300",
      ARCHIVED: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
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

  const getVerificationBadge = (doc: Document) => {
    if (!doc.verificationStatus) return null;
    
    const styles = {
      VERIFYING: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      VERIFIED: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
      FAILED: "bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      NEEDS_REVIEW: "bg-orange-200 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    };

    const labels = {
      VERIFYING: "Проверяется...",
      VERIFIED: "✓ Проверено",
      FAILED: "✗ Не прошло проверку",
      NEEDS_REVIEW: "Требует проверки",
    };

    const icons = {
      VERIFYING: (
        <svg className="h-3 w-3 animate-spin mr-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ),
      VERIFIED: null,
      FAILED: null,
      NEEDS_REVIEW: null,
    };

    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          styles[doc.verificationStatus as keyof typeof styles] || ""
        }`}
        title={doc.verificationMessage || undefined}
      >
        {icons[doc.verificationStatus as keyof typeof icons]}
        {labels[doc.verificationStatus as keyof typeof labels] || doc.verificationStatus}
      </span>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      MEMBERSHIP_APPLICATION: "Заявление о вступлении",
      CONTRIBUTION_APPLICATION: "Заявление о взносах",
      APPEAL: "Обращение",
      AGENDA: "Повестка дня",
      PROTOCOL: "Протокол",
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

  const currentDocuments = activeTab === "incoming" ? incomingDocuments : outgoingDocuments;

  return (
    <div className="w-full max-w-full space-y-6 md:space-y-8 pb-8 md:pb-12">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">Мои документы</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 md:text-base">
          {activeTab === "incoming" 
            ? "Документы для ознакомления: устав и документы, назначенные вам"
            : "Ваши заявления: заявления о вступлении и о перечислении взносов"}
        </p>
      </div>

      {/* Вкладки */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("incoming")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "incoming"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Входящие
            {incomingDocuments.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {incomingDocuments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("outgoing")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "outgoing"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Исходящие
            {outgoingDocuments.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {outgoingDocuments.length}
              </span>
            )}
          </button>
        </nav>
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

      {currentDocuments.length === 0 ? (
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
            {activeTab === "incoming" ? "Нет входящих документов" : "Документов пока нет"}
          </h3>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 md:text-sm">
            {activeTab === "incoming" 
              ? "Здесь будут отображаться документы, назначенные вам для ознакомления"
              : "Заполните профиль через AI чат, чтобы система сформировала ваши заявления"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 w-full max-w-full">
          {currentDocuments.map((doc) => (
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
                    {getVerificationBadge(doc)}
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
                    {activeTab === "incoming" && doc.assignedAt && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="whitespace-nowrap">Назначен: {formatDate(doc.assignedAt)}</span>
                      </>
                    )}
                    {activeTab === "incoming" && doc.sender && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="whitespace-nowrap">От: {doc.sender}</span>
                      </>
                    )}
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
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-400 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:w-auto sm:px-4"
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
                  {/* Кнопка загрузки подписанного для GENERATED/SIGNED документов */}
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
                          <span className="whitespace-nowrap">
                            {doc.signedFilePath ? "Заменить заявление" : "Прикрепить заявление"}
                          </span>
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
                  {/* Ссылка на скачивание прикреплённого заявления (не яркая кнопка) */}
                  {doc.signedFilePath && (doc.status === 'SIGNED' || doc.status === 'PENDING' || doc.status === 'APPROVED') && (
                    <a
                      href={`/api/documents/${doc.id}/download?signed=true`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 transition-colors hover:bg-green-50 dark:hover:bg-green-900/20 sm:w-auto sm:px-4"
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
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="hidden sm:inline">Моё заявление</span>
                      <span className="sm:hidden">Моё</span>
                    </a>
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

