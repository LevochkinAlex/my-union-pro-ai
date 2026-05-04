"use client";

import { useCallback, useState } from "react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";

export type PartnerPaymentDocumentLink = {
  id: string;
  originalFileName: string;
  viewUrl: string;
  createdAt?: string;
};

type Props = {
  documents: PartnerPaymentDocumentLink[];
};

type PreviewState =
  | { variant: "image"; url: string; fileName: string }
  | { variant: "pdf"; url: string; fileName: string }
  | { variant: "text"; fileName: string; text: string }
  | { variant: "unsupported"; url: string; fileName: string };

function pdfIframeSrc(url: string): string {
  if (url.includes("#")) return url;
  return `${url}#toolbar=1&navpanes=1&scrollbar=1`;
}

function previewKind(fileName: string): PreviewState["variant"] {
  const lower = fileName.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(lower)) return "image";
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(txt|csv|md|json|log)$/i.test(lower)) return "text";
  return "unsupported";
}

/** Список отправленных файлов; просмотр — в модалке (как в зоне вложений). */
export default function PartnerApplicationPaymentDocumentsLinks({ documents }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
    setLoadingId(null);
  }, []);

  const openPreview = useCallback(async (doc: PartnerPaymentDocumentLink) => {
    const fileName = doc.originalFileName;
    const url = doc.viewUrl;
    const kind = previewKind(fileName);

    if (kind === "image") {
      setPreview({ variant: "image", url, fileName });
      return;
    }
    if (kind === "pdf") {
      setPreview({ variant: "pdf", url, fileName });
      return;
    }
    if (kind === "text") {
      setLoadingId(doc.id);
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        setPreview({ variant: "text", fileName, text });
      } catch {
        setPreview({ variant: "unsupported", url, fileName });
      } finally {
        setLoadingId(null);
      }
      return;
    }

    setPreview({ variant: "unsupported", url, fileName });
  }, []);

  if (documents.length === 0) return null;

  return (
    <>
      <ul className="w-full space-y-1.5 text-left text-sm">
        {documents.map((d) => (
          <li key={d.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => void openPreview(d)}
              disabled={loadingId === d.id}
              className="inline-flex min-w-0 max-w-full items-baseline gap-x-2 text-left font-medium text-blue-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-blue-400"
              title={d.originalFileName}
            >
              <span className="min-w-0 truncate text-blue-600 dark:text-blue-400">{d.originalFileName}</span>
              {d.createdAt ? (
                <span className="shrink-0 text-xs font-normal tabular-nums text-blue-600 dark:text-blue-400">
                  {new Date(d.createdAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <Modal
        isOpen={preview !== null}
        onClose={closePreview}
        className="max-w-6xl w-full"
        isFullscreen={false}
      >
        {preview ? (
          <>
            <ModalHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Просмотр документа</h3>
            </ModalHeader>
            <ModalBody className="p-4">
              {preview.variant === "image" ? (
                <div className="flex h-[80vh] w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
                  <img
                    src={preview.url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : null}
              {preview.variant === "pdf" ? (
                <div className="h-[80vh] w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
                  <iframe
                    title="PDF Preview"
                    src={pdfIframeSrc(preview.url)}
                    className="h-full min-h-[600px] w-full"
                  />
                </div>
              ) : null}
              {preview.variant === "text" ? (
                <div className="max-h-[80vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950">
                  <pre className="whitespace-pre-wrap break-words p-4 text-left text-xs text-gray-900 dark:text-gray-100 sm:text-sm">
                    {preview.text}
                  </pre>
                </div>
              ) : null}
              {preview.variant === "unsupported" ? (
                <div className="space-y-4 py-2 text-center text-sm text-gray-600 dark:text-gray-300">
                  <p className="font-medium text-gray-800 dark:text-gray-200">{preview.fileName}</p>
                  <p>
                    Предпросмотр этого типа файла в окне недоступен. Откройте в новой вкладке или скачайте
                    файл.
                  </p>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
                  >
                    Открыть в новой вкладке
                  </a>
                </div>
              ) : null}
            </ModalBody>
            <ModalFooter className="flex justify-end">
              <button
                type="button"
                onClick={closePreview}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Закрыть
              </button>
            </ModalFooter>
          </>
        ) : null}
      </Modal>
    </>
  );
}
