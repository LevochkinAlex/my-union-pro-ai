"use client";

import { memo } from "react";
import { getFileUrl } from "@/lib/chat-utils";
import { isImageFile, formatFileSize } from "@/lib/file-utils";

interface FileAttachmentProps {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType?: string | null;
  showPreview?: boolean;
  className?: string;
}

export const FileAttachment = memo(function FileAttachment({
  fileName,
  filePath,
  fileSize,
  mimeType,
  showPreview = true,
  className = "",
}: FileAttachmentProps) {
  const fileUrl = getFileUrl(filePath);
  const isImage = isImageFile(fileName, mimeType);

  if (isImage && showPreview) {
    return (
      <div className={`rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 overflow-hidden ${className}`}>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <img
            src={fileUrl}
            alt={fileName}
            className="w-full h-auto max-h-96 object-contain bg-gray-100 dark:bg-gray-900"
            onError={(e) => {
              // Если изображение не загрузилось, скрываем его и показываем ошибку
              const target = e.currentTarget;
              target.style.display = 'none';
              
              // Находим родительский контейнер и заменяем содержимое на файловую ссылку
              const container = target.closest('.rounded-lg');
              if (container) {
                const linkElement = container.querySelector('a');
                if (linkElement) {
                  linkElement.innerHTML = `
                    <div class="flex items-center gap-3 px-4 py-3">
                      <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                      </svg>
                      <div class="flex-1">
                        <p class="text-sm font-medium text-gray-900 dark:text-white">${fileName}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Не удалось загрузить изображение • ${formatFileSize(fileSize)}</p>
                      </div>
                      <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                      </svg>
                    </div>
                  `;
                  linkElement.className = 'flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';
                }
              }
            }}
          />
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {fileName} • {formatFileSize(fileSize)}
            </p>
          </div>
        </a>
      </div>
    );
  }

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors ${className}`}
    >
      <svg
        className="h-5 w-5 text-gray-400 flex-shrink-0"
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
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {fileName}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatFileSize(fileSize)}
        </p>
      </div>
      <svg
        className="h-5 w-5 text-gray-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
});

export default FileAttachment;

