/**
 * Клиентские утилиты для чата
 * ВАЖНО: Этот файл используется в клиентских компонентах!
 * НЕ импортировать сюда Prisma или серверные модули!
 * Серверные функции находятся в lib/chat-server-utils.ts
 */

import { ChatUser } from "@/types/chat";
import { getFileUrlWithCDN, getFileUrlByCategory } from "@/lib/cdn";
import { formatFileSize as formatFileSizeUtil } from "@/lib/file-utils";

/**
 * Получить полное имя пользователя
 * В русской традиции: Фамилия Имя Отчество
 * Консистентно с остальным приложением (lib/documents.ts, MergeAccountsModal, ppo-head pages)
 */
export function getUserName(user: ChatUser | any | null | undefined): string {
  if (!user) return "Пользователь";
  const parts = [user.lastName, user.firstName, user.middleName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Пользователь";
}

/**
 * Получить инициалы пользователя
 * Умная логика: если есть и имя и фамилия - первые буквы обоих
 * Если только имя - первые 2 буквы имени (или первую если имя короткое)
 * Если только фамилия - первые 2 буквы фамилии
 */
export function getInitials(user: ChatUser | any | null | undefined): string {
  if (!user) return "П";
  
  const first = user.firstName?.trim() || "";
  const last = user.lastName?.trim() || "";
  
  // Если есть и имя и фамилия - первые буквы обоих
  if (first && last) {
    return (first[0] + last[0]).toUpperCase();
  }
  
  // Если только имя - первые 2 буквы или 1 если короткое
  if (first) {
    return first.length >= 2 
      ? (first[0] + first[1]).toUpperCase() 
      : first[0].toUpperCase();
  }
  
  // Если только фамилия - первые 2 буквы
  if (last) {
    return last.length >= 2 
      ? (last[0] + last[1]).toUpperCase() 
      : last[0].toUpperCase();
  }
  
  return "П";
}

/**
 * Форматировать время сообщения
 */
export function formatTime(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/**
 * Форматировать дату для группировки сообщений
 */
export function formatMessageDate(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Сегодня";
  } else if (diffDays === 1) {
    return "Вчера";
  } else if (diffDays < 7) {
    return date.toLocaleDateString("ru-RU", { weekday: "long" });
  } else {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }
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