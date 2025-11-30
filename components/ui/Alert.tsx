"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type AlertType = "info" | "success" | "warning" | "error";

interface AlertProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  autoClose?: number; // Автозакрытие через N миллисекунд
}

export function Alert({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText = "Отмена",
  onConfirm,
  onCancel,
  autoClose,
}: AlertProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoClose);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const typeConfig = {
    info: {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      borderColor: "border-blue-200 dark:border-blue-800",
      textColor: "text-blue-800 dark:text-blue-200",
      iconColor: "text-blue-600 dark:text-blue-400",
      buttonColor: "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600",
    },
    success: {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bgColor: "bg-green-50 dark:bg-green-900/20",
      borderColor: "border-green-200 dark:border-green-800",
      textColor: "text-green-800 dark:text-green-200",
      iconColor: "text-green-600 dark:text-green-400",
      buttonColor: "bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600",
    },
    warning: {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      bgColor: "bg-orange-50 dark:bg-orange-900/20",
      borderColor: "border-orange-200 dark:border-orange-800",
      textColor: "text-orange-800 dark:text-orange-200",
      iconColor: "text-orange-600 dark:text-orange-400",
      buttonColor: "bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600",
    },
    error: {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bgColor: "bg-red-50 dark:bg-red-900/20",
      borderColor: "border-red-200 dark:border-red-800",
      textColor: "text-red-800 dark:text-red-200",
      iconColor: "text-red-600 dark:text-red-400",
      buttonColor: "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600",
    },
  };

  const config = typeConfig[type];

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  const content = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`
            relative w-full max-w-md
            ${config.bgColor} ${config.borderColor}
            border-2 rounded-2xl shadow-2xl
            pointer-events-auto
            animate-in fade-in zoom-in-95 duration-200
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 z-10 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Content */}
          <div className="p-6">
            {/* Icon and Title */}
            <div className="flex items-start gap-4 mb-4">
              <div className={`flex-shrink-0 ${config.iconColor}`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                {title && (
                  <h3 className={`text-lg font-semibold mb-2 ${config.textColor}`}>
                    {title}
                  </h3>
                )}
                <p className={`text-sm leading-relaxed whitespace-pre-line ${config.textColor}`}>
                  {message}
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end mt-6">
              {onCancel && (
                <button
                  onClick={handleCancel}
                  className="
                    px-4 py-2.5 rounded-lg font-medium text-sm
                    bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700
                    text-gray-700 dark:text-gray-300
                    transition-colors
                    sm:min-w-[100px]
                  "
                >
                  {cancelText}
                </button>
              )}
              <button
                onClick={handleConfirm}
                className={`
                  px-4 py-2.5 rounded-lg font-medium text-sm text-white
                  ${config.buttonColor}
                  transition-colors
                  sm:min-w-[100px]
                `}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}

// Хук для удобного использования
export function useAlert() {
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: AlertType;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    autoClose?: number;
  }>({
    isOpen: false,
    message: "",
  });

  const showAlert = (options: {
    title?: string;
    message: string;
    type?: AlertType;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    autoClose?: number;
  }) => {
    setAlertState({
      isOpen: true,
      ...options,
    });
  };

  const closeAlert = () => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  };

  const AlertComponent = (
    <Alert
      isOpen={alertState.isOpen}
      onClose={closeAlert}
      title={alertState.title}
      message={alertState.message}
      type={alertState.type}
      confirmText={alertState.confirmText}
      cancelText={alertState.cancelText}
      onConfirm={alertState.onConfirm}
      onCancel={alertState.onCancel}
      autoClose={alertState.autoClose}
    />
  );

  return {
    showAlert,
    closeAlert,
    AlertComponent,
  };
}

// Глобальная функция для замены alert()
let globalAlertHandler: ((options: {
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  autoClose?: number;
}) => void) | null = null;

export function setGlobalAlertHandler(handler: typeof globalAlertHandler) {
  globalAlertHandler = handler;
}

export function showAlert(options: {
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  autoClose?: number;
}) {
  if (globalAlertHandler) {
    globalAlertHandler(options);
  } else {
    // Fallback на стандартный alert
    window.alert(options.message);
  }
}

// Функция для замены confirm()
export function showConfirm(options: {
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (globalAlertHandler) {
      globalAlertHandler({
        ...options,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    } else {
      // Fallback на стандартный confirm
      resolve(window.confirm(options.message));
    }
  });
}

