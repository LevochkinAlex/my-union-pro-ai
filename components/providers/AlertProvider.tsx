"use client";

import React, { useEffect, useState } from "react";
import { Alert, setGlobalAlertHandler, showAlert, showConfirm } from "@/components/ui/Alert";

// Глобальный провайдер для Alert
export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: "info" | "success" | "warning" | "error";
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    autoClose?: number;
    messageClassName?: string;
  }>({
    isOpen: false,
    message: "",
  });

  useEffect(() => {
    // Устанавливаем глобальный обработчик
    setGlobalAlertHandler((options) => {
      setAlertState({
        isOpen: true,
        ...options,
      });
    });

    // Экспортируем функции в window для глобального доступа
    (window as any).showAlert = showAlert;
    (window as any).showConfirm = showConfirm;
  }, []);

  const closeAlert = () => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleConfirm = () => {
    if (alertState.onConfirm) {
      alertState.onConfirm();
    }
    closeAlert();
  };

  const handleCancel = () => {
    if (alertState.onCancel) {
      alertState.onCancel();
    }
    closeAlert();
  };

  return (
    <>
      {children}
      <Alert
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        autoClose={alertState.autoClose}
        messageClassName={alertState.messageClassName}
      />
    </>
  );
}

