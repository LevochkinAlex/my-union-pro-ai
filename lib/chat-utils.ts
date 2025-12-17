import { ChatUser } from "@/types/chat";
import { getFileUrlWithCDN } from "@/lib/cdn";

/**
 * Получить полное имя пользователя
 */
export function getUserName(user: ChatUser | null | undefined): string {
  if (!user) return "Неизвестный";
  const parts = [user.lastName, user.firstName, user.middleName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Неизвестный";
}

/**
 * Получить инициалы пользователя
 */
export function getInitials(user: ChatUser | null | undefined): string {
  if (!user) return "?";
  const first = user.firstName?.[0] || "";
  const last = user.lastName?.[0] || "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Форматировать время сообщения
 */
export function formatTime(dateString: string | Date): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Вчера";
  } else if (diffDays < 7) {
    return date.toLocaleDateString("ru-RU", { weekday: "short" });
  } else {
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  }
}

/**
 * Форматировать дату для группировки сообщений
 */
export function formatMessageDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Сегодня";
  } else if (diffDays === 1) {
    return "Вчера";
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
  if (filePath.startsWith("data:")) return filePath;
  return getFileUrlWithCDN(filePath, true);
}

/**
 * Форматировать размер файла
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

