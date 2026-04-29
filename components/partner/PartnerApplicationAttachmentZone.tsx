"use client";

import { useCallback, useId, useRef, useState } from "react";

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.txt,.rtf,.odt,.ods";

export default function PartnerApplicationAttachmentZone() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const mergeFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming || (incoming instanceof FileList && incoming.length === 0)) return;
    const next = incoming instanceof FileList ? Array.from(incoming) : [...incoming];
    setFiles((prev) => {
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
    });
  }, []);

  const removeAt = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

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
        className={`w-full rounded-lg border-2 border-dashed px-4 py-8 ${
          dragActive
            ? "border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-950/30"
            : "border-gray-300 bg-white/60 hover-surface dark:border-gray-600 dark:bg-gray-900/40"
        }`}
      >
        <p className="text-center text-sm text-gray-600 dark:text-gray-300">
          Перетащите файлы сюда или{" "}
          <span className="font-medium text-blue-600 underline decoration-blue-600/30 dark:text-blue-400">
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
              <span className="min-w-0 truncate text-gray-800 dark:text-gray-100" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-gray-400">
                {(file.size / 1024).toFixed(file.size < 102400 ? 1 : 0)} КБ
              </span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
