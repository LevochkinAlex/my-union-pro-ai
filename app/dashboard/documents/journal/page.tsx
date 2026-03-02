"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import { DATE_INPUT_MIN, DATE_INPUT_MAX, normalizeDateInputValue } from "@/lib/date-bounds";

type DocumentCategory = "INCOMING" | "OUTGOING" | "INTERNAL" | "DRAFT";
type DocumentStatus = 
  | "DRAFT" 
  | "PENDING_REVIEW" 
  | "PENDING_APPROVAL" 
  | "PENDING_SIGNATURE" 
  | "SIGNED" 
  | "REGISTERED" 
  | "SENT" 
  | "RECEIVED" 
  | "COMPLETED" 
  | "REJECTED" 
  | "ARCHIVED";

interface Document {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: DocumentStatus;
  category: DocumentCategory;
  regNumber: string | null;
  regDate: string | null;
  dueDate: string | null;
  isUrgent: boolean;
  senderName: string | null;
  senderOrganization: string | null;
  recipientName: string | null;
  recipientOrganization: string | null;
  filePath: string | null;
  createdAt: string;
  user: { id: string; firstName: string | null; lastName: string | null };
  assignedTo: { id: string; firstName: string | null; lastName: string | null } | null;
  approvedBy: { id: string; firstName: string | null; lastName: string | null } | null;
  signedBy: { id: string; firstName: string | null; lastName: string | null } | null;
  _count: { approvals: number; responses: number };
}

interface Stats {
  byCategory: Record<DocumentCategory, number>;
  byStatus: Record<string, number>;
  pendingMyAction: number;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  INCOMING: "Входящие",
  OUTGOING: "Исходящие",
  INTERNAL: "Внутренние",
  DRAFT: "Черновики",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "Черновик",
  PENDING_REVIEW: "На рассмотрении",
  PENDING_APPROVAL: "На согласовании",
  PENDING_SIGNATURE: "На подписи",
  SIGNED: "Подписан",
  REGISTERED: "Зарегистрирован",
  SENT: "Отправлен",
  RECEIVED: "Получен",
  COMPLETED: "Исполнен",
  REJECTED: "Отклонён",
  ARCHIVED: "В архиве",
};

const STATUS_COLORS: Record<DocumentStatus, string> = {
  DRAFT: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  PENDING_REVIEW: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PENDING_APPROVAL: "bg-orange-200 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  PENDING_SIGNATURE: "bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  SIGNED: "bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REGISTERED: "bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  SENT: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  RECEIVED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  COMPLETED: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  REJECTED: "bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ARCHIVED: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
};

export default function DocumentJournalPage() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [activeCategory, page]);

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (activeCategory) params.set("category", activeCategory);
      if (search) params.set("search", search);
      params.set("page", page.toString());
      params.set("limit", "20");

      const response = await fetch(`/api/ppo-head/documents/journal?${params}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        setStats(data.stats);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (error) {
      console.error("Ошибка загрузки документов:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    loadDocuments();
  };

  const handleWorkflowAction = async (documentId: string, action: string, comment?: string) => {
    try {
      const response = await fetch(`/api/ppo-head/documents/${documentId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment }),
      });

      if (response.ok) {
        const data = await response.json();
        alertSuccess(data.message);
        loadDocuments();
      } else {
        const error = await response.json();
        alertError(error.error || "Ошибка при выполнении действия");
      }
    } catch (error) {
      alertError("Ошибка при выполнении действия");
    }
  };

  const getUserName = (user: { firstName: string | null; lastName: string | null } | null) => {
    if (!user) return "—";
    return [user.lastName, user.firstName].filter(Boolean).join(" ") || "—";
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("ru-RU");
  };

  const getAvailableActions = (status: DocumentStatus) => {
    switch (status) {
      case "DRAFT":
        return [
          { action: "submit_for_review", label: "На рассмотрение", color: "blue" },
          { action: "submit_for_approval", label: "На согласование", color: "orange" },
        ];
      case "PENDING_REVIEW":
        return [
          { action: "submit_for_approval", label: "На согласование", color: "orange" },
          { action: "return_to_draft", label: "В черновик", color: "gray" },
        ];
      case "PENDING_APPROVAL":
        return [
          { action: "approve", label: "Согласовать", color: "green" },
          { action: "reject", label: "Отклонить", color: "red" },
        ];
      case "PENDING_SIGNATURE":
        return [
          { action: "sign", label: "Подписать", color: "green" },
          { action: "reject", label: "Отклонить", color: "red" },
        ];
      case "SIGNED":
        return [{ action: "register", label: "Зарегистрировать", color: "purple" }];
      case "REGISTERED":
        return [
          { action: "send", label: "Отправить", color: "cyan" },
          { action: "complete", label: "Исполнить", color: "emerald" },
        ];
      case "REJECTED":
        return [{ action: "return_to_draft", label: "В черновик", color: "gray" }];
      default:
        return [];
    }
  };

  if (isLoading && documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка журнала...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 w-full">
      {/* Заголовок */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Журнал документов
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Входящие, исходящие и внутренние документы организации
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            + Новый документ
          </button>
        </div>
      </div>

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div
            onClick={() => setActiveCategory(null)}
            className={`p-4 rounded-xl border cursor-pointer transition-colors ${
              activeCategory === null
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 hover:border-blue-300"
            }`}
          >
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {Object.values(stats.byCategory).reduce((a, b) => a + b, 0)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Всего</p>
          </div>
          {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((cat) => (
            <div
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                activeCategory === cat
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-blue-300"
              }`}
            >
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.byCategory[cat] || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{CATEGORY_LABELS[cat]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Уведомление о задачах */}
      {stats && stats.pendingMyAction > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold">
              {stats.pendingMyAction}
            </div>
            <div>
              <p className="font-medium text-orange-800 dark:text-orange-200">
                Документов ожидают вашего действия
              </p>
              <p className="text-sm text-orange-600 dark:text-orange-400">
                Требуется согласование или подпись
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Поиск */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Поиск по названию или номеру..."
          className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Найти
        </button>
      </div>

      {/* Список документов */}
      {documents.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
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
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            Нет документов
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {activeCategory
              ? `Нет документов в категории "${CATEGORY_LABELS[activeCategory]}"`
              : "Начните с создания нового документа"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Рег. №
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Документ
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Категория
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Дата
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Исполнитель
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {documents.map((doc) => (
                <tr key={doc.id} className={doc.isUrgent ? "bg-red-50 dark:bg-red-900/10" : ""}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-mono text-gray-900 dark:text-white">
                      {doc.regNumber || "—"}
                    </span>
                    {doc.isUrgent && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded">
                        СРОЧНО
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {doc.title}
                    </div>
                    {doc.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                        {doc.description}
                      </div>
                    )}
                    {doc.senderOrganization && (
                      <div className="text-xs text-gray-400 mt-1">
                        От: {doc.senderOrganization}
                      </div>
                    )}
                    {doc.recipientOrganization && (
                      <div className="text-xs text-gray-400 mt-1">
                        Кому: {doc.recipientOrganization}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {CATEGORY_LABELS[doc.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[doc.status]}`}
                    >
                      {STATUS_LABELS[doc.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(doc.regDate || doc.createdAt)}
                    {doc.dueDate && (
                      <div className="text-xs text-orange-500">
                        Срок: {formatDate(doc.dueDate)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {getUserName(doc.assignedTo)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      {doc.filePath && (
                        <a
                          href={doc.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          title="Скачать"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </a>
                      )}
                      {getAvailableActions(doc.status).slice(0, 2).map((act) => (
                        <button
                          key={act.action}
                          onClick={() => handleWorkflowAction(doc.id, act.action)}
                          className={`px-2 py-1 text-xs rounded ${
                            act.color === "green"
                              ? "bg-green-200 text-green-700 hover:bg-green-300"
                              : act.color === "red"
                              ? "bg-red-200 text-red-700 hover:bg-red-300"
                              : act.color === "blue"
                              ? "bg-blue-200 text-blue-700 hover:bg-blue-300"
                              : act.color === "orange"
                              ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                              : act.color === "purple"
                              ? "bg-purple-200 text-purple-700 hover:bg-purple-300"
                              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                          }`}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
          >
            ←
          </button>
          <span className="px-3 py-1">
            {page} из {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}

      {/* Модальное окно создания документа */}
      {showCreateModal && (
        <CreateDocumentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadDocuments();
          }}
        />
      )}
    </div>
  );
}

// Компонент модального окна создания документа
function CreateDocumentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "INCOMING" as DocumentCategory,
    isUrgent: false,
    dueDate: "",
    senderName: "",
    senderOrganization: "",
    senderRegNumber: "",
    senderDate: "",
    recipientName: "",
    recipientOrganization: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.title) {
      alertError("Укажите название документа");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/ppo-head/documents/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alertSuccess("Документ создан");
        onCreated();
      } else {
        const error = await response.json();
        alertError(error.error || "Ошибка при создании документа");
      }
    } catch (error) {
      alertError("Ошибка при создании документа");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Новый документ
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Категория *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as DocumentCategory })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="INCOMING">Входящий</option>
                <option value="OUTGOING">Исходящий</option>
                <option value="INTERNAL">Внутренний</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Название документа *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: Письмо от ЦК Профсоюза"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Описание
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                rows={3}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isUrgent}
                  onChange={(e) => setFormData({ ...formData, isUrgent: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Срочный</span>
              </label>
              <div className="flex-1">
                <input
                  type="date"
                  min={DATE_INPUT_MIN}
                  max={DATE_INPUT_MAX}
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: normalizeDateInputValue(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
                  placeholder="Срок исполнения"
                />
              </div>
            </div>

            {formData.category === "INCOMING" && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Отправитель</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={formData.senderOrganization}
                    onChange={(e) => setFormData({ ...formData, senderOrganization: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-600"
                    placeholder="Организация"
                  />
                  <input
                    type="text"
                    value={formData.senderName}
                    onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-600"
                    placeholder="ФИО отправителя"
                  />
                  <input
                    type="text"
                    value={formData.senderRegNumber}
                    onChange={(e) => setFormData({ ...formData, senderRegNumber: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-600"
                    placeholder="Исх. номер"
                  />
                  <input
                    type="date"
                    min={DATE_INPUT_MIN}
                    max={DATE_INPUT_MAX}
                    value={formData.senderDate}
                    onChange={(e) => setFormData({ ...formData, senderDate: normalizeDateInputValue(e.target.value) })}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-600"
                  />
                </div>
              </div>
            )}

            {formData.category === "OUTGOING" && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Получатель</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={formData.recipientOrganization}
                    onChange={(e) => setFormData({ ...formData, recipientOrganization: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-600"
                    placeholder="Организация"
                  />
                  <input
                    type="text"
                    value={formData.recipientName}
                    onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-600"
                    placeholder="ФИО получателя"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? "Создание..." : "Создать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
