'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';

export interface PendingApprovalItem {
  meetingId: string;
  documentId: string;
  title: string;
  docLabel: string;
}

interface MeetingChatPendingApprovalsProps {
  meetingId: string | null | undefined;
  isChairman: boolean;
  onApproved?: () => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

export default function MeetingChatPendingApprovals({
  meetingId,
  isChairman,
  onApproved,
  showToast,
}: MeetingChatPendingApprovalsProps) {
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [previewDoc, setPreviewDoc] = useState<{ documentId: string; title: string } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState<boolean | null>(null);
  const [previewLoadError, setPreviewLoadError] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!meetingId || isChairman) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/meetings/${meetingId}/pending-approvals`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [meetingId, isChairman]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleApprove = useCallback(
    async (item: PendingApprovalItem) => {
      setSubmittingId(item.documentId);
      try {
        const res = await fetch(
          `/api/ppo-head/meetings/${item.meetingId}/documents/${item.documentId}/approve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'approve',
              comment: comment[item.documentId] || undefined,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка');
        showToast?.(data.message || 'Документ согласован', 'success');
        setComment((prev) => ({ ...prev, [item.documentId]: '' }));
        await fetchPending();
        onApproved?.();
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : 'Не удалось согласовать', 'error');
      } finally {
        setSubmittingId(null);
      }
    },
    [comment, fetchPending, onApproved, showToast]
  );

  const handleReject = useCallback(
    async (item: PendingApprovalItem) => {
      setSubmittingId(item.documentId);
      try {
        const res = await fetch(
          `/api/ppo-head/meetings/${item.meetingId}/documents/${item.documentId}/approve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'reject',
              comment: comment[item.documentId] || undefined,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка');
        showToast?.(data.message || 'Документ отклонён', 'success');
        setComment((prev) => ({ ...prev, [item.documentId]: '' }));
        await fetchPending();
        onApproved?.();
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : 'Не удалось отклонить', 'error');
      } finally {
        setSubmittingId(null);
      }
    },
    [comment, fetchPending, onApproved, showToast]
  );

  const handleOpenDocument = useCallback((item: PendingApprovalItem) => {
    setPreviewDoc({ documentId: item.documentId, title: item.title });
  }, []);

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
    const url = `/api/documents/${encodeURIComponent(previewDoc.documentId)}/download?inline=true`;
    setPreviewBlobUrl(null);
    setPreviewIsPdf(null);
    setPreviewLoadError(null);
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok)
          throw new Error(
            res.status === 403 ? 'Доступ запрещён' : res.status === 404 ? 'Документ не найден' : 'Ошибка загрузки'
          );
        return res.blob();
      })
      .then((blob) => {
        const contentType = blob.type || '';
        const isPdf = contentType.includes('pdf') || contentType.includes('octet-stream');
        setPreviewIsPdf(isPdf);
        setPreviewBlobUrl(URL.createObjectURL(blob));
      })
      .catch((e) => {
        setPreviewLoadError(e instanceof Error ? e.message : 'Ошибка загрузки');
      });
    return () => {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [previewDoc?.documentId]);

  if (!meetingId || isChairman || (items.length === 0 && !loading)) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
        <span className="text-sm text-amber-800 dark:text-amber-200">Загрузка документов на согласование…</span>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-gray-200 dark:border-gray-700 bg-amber-50/80 dark:bg-amber-900/20 px-3 py-2">
        <div className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
          Документы на согласование
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.documentId}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-white dark:bg-gray-800/80 border border-amber-200 dark:border-amber-800 p-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {item.docLabel}: {item.title}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Примечание (необяз.)"
                  value={comment[item.documentId] ?? ''}
                  onChange={(e) =>
                    setComment((prev) => ({ ...prev, [item.documentId]: e.target.value }))
                  }
                  className="w-28 sm:w-36 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => handleApprove(item)}
                  disabled={submittingId === item.documentId}
                  className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {submittingId === item.documentId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Согласовать
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(item)}
                  disabled={submittingId === item.documentId}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 disabled:opacity-50"
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenDocument(item)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  title="Открыть документ"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Открыть
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Модалка просмотра документа (только веб) */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр документа"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="relative flex w-full max-w-4xl flex-col rounded-lg sm:max-h-[90vh] max-h-[100vh] bg-white dark:bg-gray-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                {previewDoc.title}
              </span>
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
            <div className="min-h-0 flex-1 overflow-hidden flex items-center justify-center p-4">
              {previewLoadError && (
                <p className="text-sm text-red-600 dark:text-red-400">{previewLoadError}</p>
              )}
              {previewBlobUrl && previewIsPdf === true && (
                <iframe
                  src={previewBlobUrl}
                  title={previewDoc.title}
                  className="w-full min-h-[70vh] sm:h-[75vh] rounded border border-gray-200 dark:border-gray-700"
                />
              )}
              {previewBlobUrl && previewIsPdf === false && (
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Просмотр в браузере недоступен. Скачайте файл.
                  </p>
                  <a
                    href={previewBlobUrl}
                    download={previewDoc.title + '.docx'}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Скачать документ
                  </a>
                </div>
              )}
              {!previewBlobUrl && !previewLoadError && (
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
