import { getFileUrlWithCDN } from "@/lib/cdn";

/**
 * Формирует URL превью изображения с поддержкой CDN
 */
export function getPreviewUrl(imageUrl: string): string {
  if (!imageUrl) return "";

  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }

  return getFileUrlWithCDN(imageUrl, true);
}

/**
 * Форматирует время для отображения
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/**
 * Получает имя пользователя из объекта пользователя
 */
export function getUserName(user: any): string {
  const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Пользователь";
}

/**
 * Получает инициалы пользователя
 */
export function getInitials(user: any): string {
  const first = user.firstName?.[0]?.toUpperCase() || "";
  const last = user.lastName?.[0]?.toUpperCase() || "";
  return first + last || "?";
}

/**
 * Извлекает обычный текст из HTML
 */
export function getPlainText(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

