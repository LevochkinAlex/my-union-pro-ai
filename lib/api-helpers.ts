/**
 * Утилиты для обработки данных в API routes
 * Обеспечивает консистентную обработку URL файлов через CDN
 */

import { getFileUrlWithCDN } from "@/lib/cdn";

/**
 * Обрабатывает avatarUrl пользователя для возврата через API
 * Преобразует относительные пути в CDN URL или API URL
 */
export function normalizeAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  
  // Если это уже полный URL, возвращаем как есть
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }
  
  // Обрабатываем через CDN
  return getFileUrlWithCDN(avatarUrl, true);
}

/**
 * Обрабатывает объект пользователя, нормализуя avatarUrl
 * Гарантирует, что avatarUrl всегда строка или null, никогда undefined
 */
export function normalizeUserAvatar<T extends { avatarUrl?: string | null }>(user: T): T & { avatarUrl: string | null } {
  if (!user) return { ...user, avatarUrl: null } as T & { avatarUrl: string | null };
  
  const normalizedAvatarUrl = user.avatarUrl ? normalizeAvatarUrl(user.avatarUrl) : null;
  
  return {
    ...user,
    avatarUrl: normalizedAvatarUrl,
  } as T & { avatarUrl: string | null };
}

/**
 * Обрабатывает массив пользователей, нормализуя avatarUrl для каждого
 */
export function normalizeUsersAvatars<T extends { avatarUrl?: string | null }>(users: T[]): T[] {
  return users.map(normalizeUserAvatar);
}

