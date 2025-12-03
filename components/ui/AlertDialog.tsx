"use client";

import { useEffect } from "react";

interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  type?: "alert" | "confirm";
}

export default function AlertDialog({
  isOpen,
  title,
  message,
  confirmText = "OK",
  cancelText = "Отмена",
  onConfirm,
  onCancel,
  type = "alert",
}: AlertDialogProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {message}
          </p>
        </div>
        <div className={`flex ${type === "confirm" ? "justify-end gap-3" : "justify-end"} p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700`}>
          {type === "confirm" && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm || onCancel}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

