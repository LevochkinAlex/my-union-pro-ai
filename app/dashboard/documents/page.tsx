"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { alertError, alertSuccess, alertWarning, confirm } from "@/lib/alert";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { useMembershipAccess } from "@/hooks/useMembershipAccess";
import { Card, PageHeader, EmptyState, StatusBadge, Spinner, Tabs } from "@/components/ui";

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
  /** Для входящих документов заседания (согласование повестки/протокола) */
  approvalStatus?: { status: string; comment: string | null; approvedAt: string | null };
  meetingId?: string;
  originalDocumentId?: string;
  /** Статус оригинала: кнопка «Согласовать» только при PENDING_APPROVAL */
  originalDocumentStatus?: string;
}

export default function DocumentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") === "outgoing" ? "outgoing" : "incoming";
  const { status, unionMembershipStatus, isApproved } = useMembershipAccess();
  const isReApplying = status === "pending" && unionMembershipStatus === "REMOVED";

  const [activeTab, setActiveTab] = useState<"incoming" | "outgoing">(tabParam);
  const [incomingDocuments, setIncomingDocuments] = useState<Document[]>([]);
  const [outgoingDocuments, setOutgoingDocuments] = useState<Document[]>([]);
  const [isElectedBody, setIsElectedBody] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileChanged, setProfileChanged] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regeneratingDocId, setRegeneratingDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [approvalComment, setApprovalComment] = useState<Record<string, string>>({});
  const [approvalSubmitting, setApprovalSubmitting] = useState<string | null>(null);
  /** Модалка просмотра во входящих: { id, useSigned?, fileName? } */
  const [previewDoc, setPreviewDoc] = useState<{ id: string; useSigned?: boolean; fileName?: string | null } | null>(null);
  /** Blob URL для превью в модалке */
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  /** true = PDF (показываем в iframe), false = Word и др. (показываем сообщение + Скачать) */
  const [previewIsPdf, setPreviewIsPdf] = useState<boolean | null>(null);
  const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);
  /** Фильтр входящих: Все документы | Повестки | Протоколы | Постановления | Выписки | Другие (устав и т.д.) */
  const [incomingFilter, setIncomingFilter] = useState<"all" | "agenda" | "protocol" | "resolutions" | "extracts" | "other">("all");

  const isDemoMember = session?.user?.id === DEMO_MEMBER_USER_ID;

  // Загрузка документа для превью в модалке (PDF — в iframe, Word и др. — сообщение + Скачать)
  useEffect(() => {
    if (!previewDoc) {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewIsPdf(null);
      setPreviewLoadError(null);
      return;
    }
    const url = `/api/documents/${encodeURIComponent(previewDoc.id)}/download?inline=true${previewDoc.useSigned ? "&signed=true" : ""}`;
    setPreviewBlobUrl(null);
    setPreviewIsPdf(null);
    setPreviewLoadError(null);
    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "Доступ запрещён" : res.status === 404 ? "Документ не найден" : "Ошибка загрузки");
        return res.blob();
      })
      .then((blob) => {
        const contentType = blob.type || "";
        const isPdf = contentType.includes("pdf") || contentType.includes("octet-stream");
        setPreviewIsPdf(isPdf);
        setPreviewBlobUrl(URL.createObjectURL(blob));
      })
      .catch((e) => {
        setPreviewLoadError(e instanceof Error ? e.message : "Не удалось загрузить документ");
      });
    return () => {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [previewDoc?.id, previewDoc?.useSigned]);

  const INCOMING_FILTERS: { value: typeof incomingFilter; label: string }[] = [
    { value: "all", label: "Все документы" },
    { value: "agenda", label: "Повестки" },
    { value: "protocol", label: "Протоколы" },
    { value: "resolutions", label: "Постановления" },
    { value: "extracts", label: "Выписки" },
    { value: "other", label: "Другие" },
  ];

  function getDocFilterType(doc: Document): typeof incomingFilter {
    if (doc.id === "charter-system") return "other";
    const t = (doc.type || "").toUpperCase();
    if (t === "AGENDA") return "agenda";
    if (t === "PROTOCOL") return "protocol";
    if (t === "RESOLUTION") return "resolutions";
    if (t === "PROTOCOL_EXTRACT") return "extracts";
    if (t === "OTHER" || (doc.title?.toLowerCase().includes("устав") || (doc.description && doc.description.toLowerCase().includes("устав")))) return "other";
    return "other";
  }

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

  const loadDocuments = async (): Promise<{ incoming: Document[]; outgoing: Document[] }> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/documents");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (data && typeof data.error === "string" ? data.error : null) || "Ошибка загрузки документов";
        throw new Error(message);
      }
      
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
      setIsElectedBody(data.isElectedBody === true);

      // Исходящие: у членов выборного органа — цикл заседаний (на странице Исходящие); у участников — только заявления
      const outgoing = (data.outgoingDocuments || []).filter((doc: Document) => {
        return doc.type === "MEMBERSHIP_APPLICATION" || doc.type === "CONTRIBUTION_APPLICATION";
      });
      setOutgoingDocuments(outgoing);

      return { incoming, outgoing };
    } catch (err) {
      console.error("Ошибка загрузки документов:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить документы");
      return { incoming: [], outgoing: [] };
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadProfileStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Синхронизация вкладки с URL
  useEffect(() => {
    setActiveTab(tabParam);
  }, [tabParam]);

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

  const handleDownload = async (docId: string, fileName: string | null, useSigned?: boolean) => {
    try {
      const encodedId = encodeURIComponent(docId);
      const downloadUrl = `/api/documents/${encodedId}/download${useSigned ? "?signed=true" : ""}`;
      const response = await fetch(downloadUrl);
      
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
      
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName || "document.pdf";
      document.body.appendChild(a);
      a.click();
      
      // Небольшая задержка перед очисткой, чтобы браузер успел начать скачивание
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
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
      const { incoming, outgoing } = await loadDocuments();
      
      // Проверяем статус документа в обоих списках
      const allDocuments = [...incoming, ...outgoing];
      const doc = allDocuments.find(d => d.id === docId);
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

  const statusColorMap: Record<string, "green" | "yellow" | "red" | "blue" | "gray" | "purple" | "orange"> = {
    DRAFT: "gray",
    GENERATED: "blue",
    PENDING_REVIEW: "yellow",
    PENDING_APPROVAL: "orange",
    PENDING_SIGNATURE: "orange",
    SIGNED: "green",
    REGISTERED: "gray",
    SENT: "blue",
    RECEIVED: "blue",
    COMPLETED: "green",
    PENDING: "yellow",
    APPROVED: "green",
    REJECTED: "red",
    ARCHIVED: "gray",
  };

  const statusLabelMap: Record<string, string> = {
    DRAFT: "Черновик",
    GENERATED: "Сформировано",
    PENDING_REVIEW: "На рассмотрении",
    PENDING_APPROVAL: "На согласовании",
    PENDING_SIGNATURE: "На подписи",
    SIGNED: "Подписан",
    REGISTERED: "Зарегистрирован",
    SENT: "Отправлен",
    RECEIVED: "Получен",
    COMPLETED: "Исполнен",
    PENDING: "На проверке",
    APPROVED: "Одобрен",
    REJECTED: "Отклонён",
    ARCHIVED: "В архиве",
  };

  const getStatusBadge = (status: string) => (
    <StatusBadge color={statusColorMap[status] ?? "gray"} dot>
      {statusLabelMap[status] ?? status}
    </StatusBadge>
  );

  const verificationColorMap: Record<string, "green" | "yellow" | "red" | "orange"> = {
    VERIFYING: "yellow",
    VERIFIED: "green",
    FAILED: "red",
    NEEDS_REVIEW: "orange",
  };

  const verificationLabelMap: Record<string, string> = {
    VERIFYING: "Проверяется...",
    VERIFIED: "✓ Проверено",
    FAILED: "✗ Не прошло проверку",
    NEEDS_REVIEW: "Требует проверки",
  };

  const getVerificationBadge = (doc: Document) => {
    if (!doc.verificationStatus) return null;
    const vstatus = doc.verificationStatus as string;

    return (
      <span title={doc.verificationMessage || undefined}>
        <StatusBadge color={verificationColorMap[vstatus] ?? "gray"}>
          {vstatus === "VERIFYING" && (
            <Spinner size="sm" className="h-3 w-3 border-yellow-700 border-t-transparent dark:border-yellow-300 dark:border-t-transparent" />
          )}
          {verificationLabelMap[vstatus] || vstatus}
        </StatusBadge>
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
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Spinner />
        <p className="text-gray-600 dark:text-gray-400">Загрузка документов...</p>
      </div>
    );
  }

  const filteredIncoming =
    activeTab === "incoming" && incomingFilter !== "all"
      ? incomingDocuments.filter((doc) => getDocFilterType(doc) === incomingFilter)
      : activeTab === "incoming"
        ? incomingDocuments
        : [];
  const currentDocuments = activeTab === "incoming" ? filteredIncoming : outgoingDocuments;

  return (
    <div className="w-full max-w-full space-y-6 md:space-y-8 pb-8 md:pb-12">
      <PageHeader
        title="Документы"
        description={
          activeTab === "incoming"
            ? (isElectedBody
                ? "Входящие: устав, повестки и протоколы на согласование, прочие документы"
                : "Входящие: устав и документы, назначенные вам")
            : "Исходящие: ваши заявления (вступление, перечисление взносов)"
        }
      />

      <Tabs
        tabs={[
          {
            id: "incoming",
            label: "Входящие",
            count: incomingDocuments.length > 0 ? incomingDocuments.length : undefined,
          },
          {
            id: "outgoing",
            label: "Исходящие",
            count: outgoingDocuments.length > 0 ? outgoingDocuments.length : undefined,
          },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => {
          setActiveTab(tabId as "incoming" | "outgoing");
          router.replace(`/dashboard/documents?tab=${tabId}`);
        }}
      />

      {/* Фильтры входящих: Все | Повестки | Протоколы | Постановления | Выписки | Другие */}
      {activeTab === "incoming" && (
        <div className="flex flex-wrap items-center gap-2">
          {INCOMING_FILTERS.map(({ value, label }) => {
            const count =
              value === "all"
                ? incomingDocuments.length
                : incomingDocuments.filter((d) => getDocFilterType(d) === value).length;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setIncomingFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  incomingFilter === value
                    ? "border-blue-500 bg-blue-500 text-white dark:border-blue-400 dark:bg-blue-600 dark:text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Баннер об изменении профиля */}
      {profileChanged && (
        <Card className="border-2 border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-900/20">
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
                      <Spinner size="sm" className="h-4 w-4 border-white border-t-transparent dark:border-white dark:border-t-transparent" />
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
        </Card>
      )}

      {currentDocuments.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="h-6 w-6"
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
          }
          title={
            activeTab === "incoming"
              ? incomingFilter !== "all"
                ? "Нет документов в этой категории"
                : "Нет входящих документов"
              : "Документов пока нет"
          }
          description={
            activeTab === "incoming"
              ? incomingFilter !== "all"
                ? "Попробуйте другую категорию или «Все документы»"
                : "Здесь будут отображаться документы, назначенные вам для ознакомления"
              : "Заполните профиль через AI чат, чтобы система сформировала ваши заявления"
          }
          action={
            activeTab === "incoming" && incomingFilter !== "all" ? (
              <button
                type="button"
                onClick={() => setIncomingFilter("all")}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Показать все документы
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 w-full max-w-full">
          {currentDocuments.map((doc) => {
            const isOutgoing = activeTab === "outgoing";
            const hasUploadedSigned = Boolean(doc.signedFilePath);
            const hasFileToDownload = Boolean(doc.filePath || doc.signedFilePath);
            return (
            <Card
              key={doc.id}
              hoverable
              className={`w-full max-w-full overflow-hidden ${
                isOutgoing && hasUploadedSigned
                  ? "border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/20 ring-1 ring-green-200 dark:ring-green-800"
                  : ""
              }`}
            >
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h3 className={`text-sm font-semibold text-gray-900 dark:text-white sm:text-base md:text-lg break-words ${
                      isOutgoing && hasUploadedSigned ? "underline decoration-green-500 decoration-2 underline-offset-2" : ""
                    }`}>
                      {doc.title}
                    </h3>
                    {isOutgoing && hasUploadedSigned && (
                      <StatusBadge color="green">Заявление загружено</StatusBadge>
                    )}
                    {activeTab === "incoming" && doc.meetingId && doc.originalDocumentId && doc.originalDocumentStatus === "PENDING_APPROVAL" && (!doc.approvalStatus || doc.approvalStatus.status === "PENDING") && (
                      <StatusBadge color="orange">Требуется согласование</StatusBadge>
                    )}
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
                  {/* Входящие: Открыть (в модалке) + Скачать. Исходящие: только Открыть (в модалке можно просмотреть, скачать и печатать) */}
                  {hasFileToDownload && (
                    <>
                      {activeTab === "incoming" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewDoc({ id: doc.id, useSigned: !doc.filePath && !!doc.signedFilePath, fileName: doc.fileName })}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto sm:px-4"
                            title="Открыть документ"
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
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            <span>Открыть</span>
                          </button>
                          <button
                            onClick={() => handleDownload(doc.id, doc.fileName, !doc.filePath && !!doc.signedFilePath)}
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
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewDoc({ id: doc.id, useSigned: !doc.filePath && !!doc.signedFilePath, fileName: doc.fileName })}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto sm:px-4"
                          title="Открыть документ в окне для просмотра, печати или скачивания"
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
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          <span>Открыть</span>
                        </button>
                      )}
                    </>
                  )}
                  {/* Согласование входящего документа заседания: только если оригинал в статусе «На согласовании» */}
                  {activeTab === "incoming" && doc.meetingId && doc.originalDocumentId && (
                    <div className="w-full rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-800/50 dark:bg-amber-900/20">
                      {doc.originalDocumentStatus === "PENDING_APPROVAL" && (!doc.approvalStatus || doc.approvalStatus.status === "PENDING") ? (
                        <>
                          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                            Требуется ваше согласование (можно добавить примечания):
                          </p>
                          <textarea
                            placeholder="Примечания (необязательно)"
                            value={approvalComment[doc.id] ?? ""}
                            onChange={(e) => setApprovalComment((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                            className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            rows={2}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                setApprovalSubmitting(doc.id);
                                try {
                                  const res = await fetch(`/api/ppo-head/meetings/${doc.meetingId}/documents/${doc.originalDocumentId}/approve`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "approve", comment: approvalComment[doc.id] || undefined }),
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(data.error || "Ошибка");
                                  alertSuccess(data.message || "Документ согласован");
                                  setApprovalComment((prev) => ({ ...prev, [doc.id]: "" }));
                                  loadDocuments();
                                } catch (e) {
                                  alertError(e instanceof Error ? e.message : "Не удалось согласовать");
                                } finally {
                                  setApprovalSubmitting(null);
                                }
                              }}
                              disabled={approvalSubmitting === doc.id}
                              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {approvalSubmitting === doc.id ? "Отправка…" : "Согласовать"}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setApprovalSubmitting(doc.id);
                                try {
                                  const res = await fetch(`/api/ppo-head/meetings/${doc.meetingId}/documents/${doc.originalDocumentId}/approve`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "reject", comment: approvalComment[doc.id] || undefined }),
                                  });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(data.error || "Ошибка");
                                  alertSuccess(data.message || "Документ отклонён");
                                  setApprovalComment((prev) => ({ ...prev, [doc.id]: "" }));
                                  loadDocuments();
                                } catch (e) {
                                  alertError(e instanceof Error ? e.message : "Не удалось отклонить");
                                } finally {
                                  setApprovalSubmitting(null);
                                }
                              }}
                              disabled={approvalSubmitting === doc.id}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                            >
                              {approvalSubmitting === doc.id ? "Отправка…" : "Отклонить"}
                            </button>
                          </div>
                        </>
                      ) : doc.approvalStatus ? (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {doc.approvalStatus.status === "APPROVED" ? (
                            <span className="text-green-600 dark:text-green-400">Согласовано</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">Отклонено</span>
                          )}
                          {doc.approvalStatus.comment && ` — ${doc.approvalStatus.comment}`}
                        </p>
                      ) : doc.originalDocumentStatus !== "PENDING_APPROVAL" ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Документ уже утверждён председателем или не отправлен на согласование.
                        </p>
                      ) : null}
                    </div>
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
                          <Spinner size="sm" className="h-4 w-4 border-gray-400 border-t-transparent dark:border-gray-400 dark:border-t-transparent" />
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
                          <Spinner size="sm" className="h-4 w-4 border-purple-600 border-t-transparent dark:border-purple-400 dark:border-t-transparent" />
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
            </Card>
          );
          })}
        </div>
      )}

      {/* Модалка просмотра PDF для входящих документов */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр документа"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Просмотр документа</span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden min-h-[75vh] flex items-center justify-center">
              {previewLoadError && (
                <p className="p-4 text-sm text-red-600 dark:text-red-400">{previewLoadError}</p>
              )}
              {!previewLoadError && !previewBlobUrl && (
                <div className="flex flex-col items-center gap-2 p-8">
                  <Spinner />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Загрузка документа…</span>
                </div>
              )}
              {!previewLoadError && previewBlobUrl && previewIsPdf && (
                <iframe
                  title="Просмотр PDF"
                  src={previewBlobUrl}
                  className="h-[75vh] w-full border-0"
                />
              )}
              {!previewLoadError && previewBlobUrl && previewIsPdf === false && (
                <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Документ в формате Word (DOCX). Браузер не может показать его в окне просмотра.
                  </p>
                  <a
                    href={previewBlobUrl}
                    download={previewDoc?.fileName || "документ.docx"}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Скачать документ
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
