"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";

type PreviewState =
  | { variant: "image"; url: string; fileName: string }
  | { variant: "pdf"; url: string; fileName: string }
  | { variant: "text"; fileName: string; text: string }
  | { variant: "unsupported"; url: string; fileName: string };

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.txt,.rtf,.odt,.ods";

/** Как на странице заседания: PDF в iframe с панелью инструментов. */
function pdfIframeSrc(url: string): string {
  if (url.includes("#")) return url;
  return `${url}#toolbar=1&navpanes=1&scrollbar=1`;
}

export type PartnerApplicationAttachmentZoneProps = {
  /** Контролируемый список файлов (например, страница заявки участника + отправка). */
  value?: File[];
  onChange?: (files: File[]) => void;
};

function mergeIntoList(prev: File[], incoming: FileList | File[]): File[] {
  const next = incoming instanceof FileList ? Array.from(incoming) : [...incoming];
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((f) => `${f.name}-${f.size}`));
  const merged = [...prev];
  for (const f of next) {
    const key = `${f.name}-${f.size}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(f);
    }
  }
  return merged;
}

export default function PartnerApplicationAttachmentZone({
  value: controlledValue,
  onChange,
}: PartnerApplicationAttachmentZoneProps = {}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const controlled = typeof onChange === "function";
  const files = controlled ? (controlledValue ?? []) : internalFiles;

  const updateFiles = useCallback(
    (updater: (prev: File[]) => File[]) => {
      if (controlled) {
        onChange!(updater(controlledValue ?? []));
      } else {
        setInternalFiles(updater);
      }
    },
    [controlled, onChange, controlledValue]
  );

  const mergeFiles = useCallback(
    (incoming: FileList | File[] | null) => {
      if (!incoming || (incoming instanceof FileList && incoming.length === 0)) return;
      updateFiles((prev) => mergeIntoList(prev, incoming));
    },
    [updateFiles]
  );

  const removeAt = (index: number) => {
    updateFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);

  const revokePreviewBlob = useCallback(() => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
  }, []);

  const closePreview = useCallback(() => {
    revokePreviewBlob();
    setPreview(null);
  }, [revokePreviewBlob]);

  useEffect(() => () => revokePreviewBlob(), [revokePreviewBlob]);

  const openPreview = useCallback(
    async (file: File) => {
      revokePreviewBlob();
      const name = file.name;
      const lower = name.toLowerCase();
      const mime = (file.type || "").toLowerCase();

      const looksImage =
        mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(lower);
      const looksPdf = mime === "application/pdf" || lower.endsWith(".pdf");
      const looksText =
        mime.startsWith("text/") || mime === "application/json" || /\.(txt|csv|md|json|log)$/i.test(lower);

      if (looksImage) {
        const url = URL.createObjectURL(file);
        previewBlobUrlRef.current = url;
        setPreview({ variant: "image", url, fileName: name });
        return;
      }
      if (looksPdf) {
        const url = URL.createObjectURL(file);
        previewBlobUrlRef.current = url;
        setPreview({ variant: "pdf", url, fileName: name });
        return;
      }
      if (looksText) {
        try {
          const text = await file.text();
          setPreview({ variant: "text", fileName: name, text });
        } catch {
          const url = URL.createObjectURL(file);
          previewBlobUrlRef.current = url;
          setPreview({ variant: "unsupported", url, fileName: name });
        }
        return;
      }

      const url = URL.createObjectURL(file);
      previewBlobUrlRef.current = url;
      setPreview({ variant: "unsupported", url, fileName: name });
    },
    [revokePreviewBlob]
  );

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="w-full text-left">
      <label htmlFor={inputId} className="sr-only">
        Прикрепить документы к заявке
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          mergeFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className="mb-2 text-center text-sm font-medium text-gray-800 dark:text-gray-100">
        Документы
      </p>
      <button
        type="button"
        onClick={openPicker}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          mergeFiles(e.dataTransfer.files);
        }}
        className={`group w-full cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${
          dragActive
            ? "border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-950/30"
            : "border-gray-300 bg-white/60 hover:border-blue-400/80 hover:bg-blue-50/50 dark:border-gray-600 dark:bg-gray-900/40 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/20"
        }`}
      >
        <p className="text-center text-sm text-gray-600 transition-colors group-hover:text-gray-800 dark:text-gray-300 dark:group-hover:text-gray-100">
          Перетащите файлы сюда или{" "}
          <span className="font-semibold text-blue-600 underline decoration-2 underline-offset-2 decoration-blue-500/50 transition-colors group-hover:text-blue-800 group-hover:decoration-blue-700 dark:text-blue-400 dark:decoration-blue-400/50 dark:group-hover:text-blue-200 dark:group-hover:decoration-blue-300/80">
            выберите на устройстве
          </span>
        </p>
        <p className="mt-1 text-center text-xs text-gray-400 dark:text-gray-500">
          PDF, Office, изображения, текст — несколько файлов
        </p>
      </button>

      {files.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${i}`}
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            >
              <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100" title={file.name}>
                {file.name}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-gray-400 tabular-nums">
                  {(file.size / 1024).toFixed(file.size < 102400 ? 1 : 0)} КБ
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void openPreview(file);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  aria-label={`Просмотр: ${file.name}`}
                >
                  Просмотр
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  aria-label={`Удалить: ${file.name}`}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

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
                  <p>Предпросмотр этого типа файла в окне недоступен. Скачайте файл и откройте на устройстве.</p>
                  <a
                    href={preview.url}
                    download={preview.fileName}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
                  >
                    Скачать
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
    </div>
  );
}
