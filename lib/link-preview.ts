/**
 * Утилиты для извлечения и предпросмотра ссылок
 */

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: 'website' | 'video' | 'article';
  videoUrl?: string;
  videoType?: string;
}

/**
 * Извлекает URL из текста
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches || [];
}

/**
 * Получает превью ссылки через API
 * @param url - URL для получения превью
 * @returns Превью ссылки или null
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    // Используем серверный API для получения OG метаданных
    const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
      method: 'GET',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.preview || null;
  } catch (error) {
    console.error('[link-preview] Error fetching preview:', error);
    return null;
  }
}

/**
 * Определяет, является ли URL видео
 */
export function isVideoUrl(url: string): boolean {
  const videoDomains = [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
  ];
  
  try {
    const urlObj = new URL(url);
    return videoDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}
