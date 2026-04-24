/**
 * Утилиты для показа красивых алертов вместо стандартных alert/confirm
 */

import { showAlert, showConfirm, type ShowAlertOptions } from "@/components/ui/Alert";

type AlertMessageStyleOptions = Pick<ShowAlertOptions, "messageClassName">;

/**
 * Показывает сообщение об успехе
 */
export function alertSuccess(message: string, title?: string, opts?: AlertMessageStyleOptions) {
  showAlert({
    message,
    title: title || "Успешно",
    type: "success",
    confirmText: "OK",
    ...(opts?.messageClassName ? { messageClassName: opts.messageClassName } : {}),
  });
}

/**
 * Показывает предупреждение
 */
export function alertWarning(message: string, title?: string) {
  showAlert({
    message,
    title: title || "Внимание",
    type: "warning",
    confirmText: "OK",
  });
}

/**
 * Показывает ошибку
 */
export function alertError(message: string, title?: string, opts?: AlertMessageStyleOptions) {
  showAlert({
    message,
    title: title || "Ошибка",
    type: "error",
    confirmText: "OK",
    ...(opts?.messageClassName ? { messageClassName: opts.messageClassName } : {}),
  });
}

/**
 * Показывает диалог подтверждения
 */
export function confirm(
  message: string,
  title?: string,
  confirmText: string = "Да",
  cancelText: string = "Отмена"
): Promise<boolean> {
  return showConfirm({
    message,
    title: title || "Подтвердите действие",
    type: "warning",
    confirmText,
    cancelText,
  });
}

