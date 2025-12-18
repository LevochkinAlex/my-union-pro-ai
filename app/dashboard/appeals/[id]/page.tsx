"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import FileAttachment from "@/components/shared/FileAttachment";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import RichTextEditor from "@/components/admin/RichTextEditor";

interface Ticket {
  id: string;
  publicId: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  chatId: string | null;
  rejectionReason: string | null;
  helpfulRating: number | null;
  helpfulRatingComment: string | null;
  helpfulRatingAt: string | null;
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    filePath: string;
  }>;
}

const TICKET_TYPES = {
  LEGAL: "Юридическое обращение",
  ACCOUNTING: "Бухгалтерское обращение",
  TECHNICAL: "Техническая поддержка",
  HR: "Кадровые вопросы",
  OTHER: "Прочее",
};

const TICKET_STATUSES = {
  PENDING: { label: "Ожидание", color: "yellow" },
  IN_PROGRESS: { label: "В работе", color: "blue" },
  RESOLVED: { label: "Решено", color: "green" },
  REJECTED: { label: "Отклонено", color: "red" },
  CLOSED: { label: "Закрыто", color: "gray" },
};

const PRIORITY_COLORS = {
  LOW: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const PRIORITY_LABELS = {
  LOW: "Низкая",
  MEDIUM: "Средняя",
  HIGH: "Высокая",
  URGENT: "Срочная",
};

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (params.id) {
      loadTicket(params.id as string);
    }
  }, [params.id]);

  const loadTicket = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/tickets/${id}`);
      if (!response.ok) {
        throw new Error("Ошибка загрузки обращения");
      }

      const data = await response.json();
      setTicket(data.ticket);
      setEditTitle(data.ticket.title);
      setEditContent(data.ticket.content);
    } catch (err) {
      console.error("Error loading ticket:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить обращение");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const statusInfo = TICKET_STATUSES[status as keyof typeof TICKET_STATUSES];
    const colorMap = {
      yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      gray: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };
    return colorMap[statusInfo?.color || "gray"] || colorMap.gray;
  };

  const canEdit = ticket?.status === "PENDING";
  const canDelete = ticket?.status === "PENDING" || ticket?.status === "REJECTED";

  const handleSaveEdit = async () => {
    if (!ticket) return;

    if (!editTitle.trim() || !editContent.trim()) {
      alertError("Заголовок и содержание обязательны");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка при сохранении");
      }

      const data = await response.json();
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              title: data.ticket.title,
              content: data.ticket.content,
              updatedAt: data.ticket.updatedAt,
            }
          : null
      );
      setIsEditing(false);
      alertSuccess("Обращение успешно обновлено!");
    } catch (err) {
      console.error("Error updating ticket:", err);
      alertError(err instanceof Error ? err.message : "Не удалось сохранить изменения");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ticket) return;

    const confirmed = await confirm(
      "Вы уверены, что хотите удалить это обращение? Это действие нельзя отменить.",
      "Удаление обращения"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/tickets/${ticket.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка при удалении");
      }

      alertSuccess("Обращение успешно удалено!");
      router.push("/dashboard/appeals");
    } catch (err) {
      console.error("Error deleting ticket:", err);
      alertError(err instanceof Error ? err.message : "Не удалось удалить обращение");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка обращения...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error || "Обращение не найдено"}
        </div>
        <Link
          href="/dashboard/appeals"
          className="inline-block rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Вернуться к списку
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/appeals"
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Назад к списку
        </Link>
        <div className="flex gap-2">
          {ticket.chatId && (
            <Link
              href={`/dashboard/chats?chatId=${ticket.chatId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Чат
            </Link>
          )}
          {canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Редактировать
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Удалить
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {isEditing ? (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Редактирование обращения
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Заголовок *
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Заголовок обращения"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Содержание *
              </label>
              <RichTextEditor
                value={editContent}
                onChange={setEditContent}
                placeholder="Опишите вашу проблему или вопрос..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditTitle(ticket.title);
                  setEditContent(ticket.content);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {ticket.title}
                  </h1>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30">
                    #{ticket.publicId}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}
                  >
                    {TICKET_STATUSES[ticket.status as keyof typeof TICKET_STATUSES]?.label ||
                      ticket.status}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM}`}
                  >
                    {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS] ||
                      ticket.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {TICKET_TYPES[ticket.type as keyof typeof TICKET_TYPES] || ticket.type}
                </p>
              </div>
            </div>

            {/* Причина отклонения */}
            {ticket.rejectionReason && ticket.status === "REJECTED" && (
              <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                  Причина отклонения:
                </h3>
                <p className="text-sm text-red-700 dark:text-red-300">{ticket.rejectionReason}</p>
              </div>
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: ticket.content }}
              />
            </div>

            {ticket.attachments && ticket.attachments.length > 0 && (
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  Прикрепленные файлы
                </h3>
                <div className="space-y-2">
                  {ticket.attachments.map((attachment) => (
                    <FileAttachment
                      key={attachment.id}
                      fileName={attachment.fileName}
                      filePath={attachment.filePath}
                      fileSize={attachment.fileSize}
                      mimeType={attachment.mimeType}
                      showPreview={true}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              <p>Создано: {new Date(ticket.createdAt).toLocaleString("ru-RU")}</p>
              {ticket.updatedAt !== ticket.createdAt && (
                <p>Обновлено: {new Date(ticket.updatedAt).toLocaleString("ru-RU")}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
