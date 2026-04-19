/**
 * Клиентские утилиты для чата
 * ВАЖНО: Этот файл используется в клиентских компонентах!
 * НЕ импортировать сюда Prisma или серверные модули!
 * Серверные функции находятся в lib/chat-service.ts
 */

import { ChatUser } from "@/types/chat";
import { getFileUrlWithCDN, getFileUrlByCategory } from "@/lib/cdn";
import { formatFileSize as formatFileSizeUtil } from "@/lib/file-utils";

/**
 * Проверка: удалённый пользователь (профиль недоступен, показывать плейсхолдер).
 */
export function isDeletedUser(user: ChatUser | any | null | undefined): boolean {
  return !!(user?.isDeleted === true || user?.id === "deleted");
}

/**
 * Получить полное имя пользователя
 * В русской традиции: Фамилия Имя Отчество
 * Консистентно с остальным приложением (lib/documents.ts, MergeAccountsModal, ppo-head pages)
 * Для удалённого пользователя возвращает сохранённое имя или "Удалённый пользователь".
 */
export function getUserName(user: ChatUser | any | null | undefined): string {
  if (!user) return "Пользователь";
  if (isDeletedUser(user)) {
    const parts = [user.lastName, user.firstName, user.middleName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Удалённый пользователь";
  }
  const parts = [user.lastName, user.firstName, user.middleName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Пользователь";
}

/**
 * Получить URL файла с CDN
 */
export function getFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  
  // Если это data URL или уже полный URL
  if (filePath.startsWith("data:") || filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  // Если это путь к документу, используем CDN для documents
  if (filePath.includes("/documents/") || filePath.includes("documents-")) {
    const filename = filePath.split("/").pop() || filePath;
    return getFileUrlByCategory("documents", filename);
  }

  return getFileUrlWithCDN(filePath, true);
}

/**
 * Форматировать размер файла
 */
export function formatFileSize(bytes: number): string {
  return formatFileSizeUtil(bytes);
}