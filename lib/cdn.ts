/**
 * Утилита для работы с CDN URL
 * Поддерживает CDN от Selectel и другие CDN провайдеры
 */

/**
 * Получает базовый URL CDN из переменных окружения
 */
export function getCDNUrl(): string | null {
  return process.env.NEXT_PUBLIC_CDN_URL || null;
}

/**
 * Проверяет, настроен ли CDN
 */
export function isCDNConfigured(): boolean {
  return !!getCDNUrl();
}

/**
 * Преобразует путь к файлу в URL с использованием CDN
 * 
 * @param filePath - Путь к файлу (например, `/uploads/posts/image.jpg` или `/api/uploads/posts/image.jpg`)
 * @param useCDN - Использовать ли CDN (по умолчанию true, если CDN настроен)
 * @returns Полный URL файла с CDN или без него
 * 
 * @example
 * // С CDN: "https://cdn.myunion.pro/uploads/posts/image.jpg"
 * // Без CDN: "/api/uploads/posts/image.jpg"
 */
export function getFileUrlWithCDN(filePath: string, useCDN: boolean = true): string {
  if (!filePath) return "";

  // Статика из public (демо-картинки) — абсолютный URL для надёжной загрузки за прокси и с Next/Image
  if (filePath.startsWith("/demo/")) {
    const path = filePath.startsWith("/") ? filePath : `/${filePath}`;
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    const base =
      typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL
        ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
        : "";
    return base ? `${base}${path}` : path;
  }

  // Если это base64 data URL, возвращаем как есть (не обрабатываем через CDN)
  if (filePath.startsWith("data:")) {
    return filePath;
  }

  // Если это уже полный URL (http/https), возвращаем как есть
  // НО: если это CDN URL с base64 внутри - это ошибка, исправляем
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    // Проверяем, не содержит ли URL base64 строку после /uploads/
    if (filePath.includes("/uploads/data:") || filePath.includes("/uploads/data%3A")) {
      // Извлекаем base64 часть
      const base64Match = filePath.match(/\/uploads\/(data[^/]*)/);
      if (base64Match) {
        // Декодируем и возвращаем чистый base64
        try {
          const decoded = decodeURIComponent(base64Match[1]);
          return decoded;
        } catch {
          // Если не удалось декодировать, возвращаем как есть
          return filePath;
        }
      }
    }
    return filePath;
  }

  const cdnUrl = useCDN ? getCDNUrl() : null;

  // Нормализуем путь к файлу
  let normalizedPath = filePath;

  // ВАЖНО: Проверяем, что путь не содержит base64 строку
  if (normalizedPath.includes("data:") || normalizedPath.includes("base64")) {
    // Если в пути есть base64, это ошибка - возвращаем как есть или пустую строку
    console.warn("[cdn] Warning: base64 string found in file path, skipping CDN conversion:", normalizedPath.substring(0, 100));
    return normalizedPath;
  }

  // Убираем префикс /api/uploads/, если есть
  if (normalizedPath.startsWith("/api/uploads/")) {
    normalizedPath = normalizedPath.replace("/api/uploads/", "/uploads/");
  }

  // Если путь не начинается с /uploads/, пытаемся его исправить
  if (!normalizedPath.startsWith("/uploads/")) {
    // Если это просто имя файла или путь без префикса
    normalizedPath = `/uploads/${normalizedPath}`;
  }

  // Если CDN настроен, используем его
  if (cdnUrl) {
    // Убираем начальный слеш из normalizedPath перед объединением
    const pathWithoutLeadingSlash = normalizedPath.replace(/^\/+/, "");
    return `${cdnUrl}/${pathWithoutLeadingSlash}`;
  }

  // Без CDN возвращаем путь через API (для обратной совместимости)
  // Конвертируем /uploads/ в /api/uploads/
  if (normalizedPath.startsWith("/uploads/")) {
    return normalizedPath.replace("/uploads/", "/api/uploads/");
  }

  return normalizedPath;
}

/**
 * Получает URL для категории файлов (posts, avatars, chat, etc.)
 * 
 * @param category - Категория файлов (posts, avatars, chat, knowledge, documents)
 * @param filename - Имя файла
 * @param useCDN - Использовать ли CDN
 * @returns Полный URL файла
 */
export function getFileUrlByCategory(
  category: "posts" | "avatars" | "chat" | "knowledge" | "documents",
  filename: string,
  useCDN: boolean = true
): string {
  const filePath = `/uploads/${category}/${filename}`;
  return getFileUrlWithCDN(filePath, useCDN);
}

/**
 * Возвращает URL через основной домен (API) для fallback при 404 с CDN.
 * Например: https://cdn.myunion.pro/uploads/chat/file.png -> /api/uploads/chat/file.png
 * На клиенте можно подставить origin: origin + result.
 */
export function getFallbackUrlForCDN(cdnOrFullUrl: string): string {
  if (!cdnOrFullUrl) return "";
  const match = cdnOrFullUrl.match(/\/uploads\/(.+)$/);
  if (match) return `/api/uploads/${match[1]}`;
  return cdnOrFullUrl;
}

/**
 * Извлекает путь к файлу из полного URL (CDN или API)
 * 
 * @param url - Полный URL файла
 * @returns Относительный путь к файлу (например, `/uploads/posts/image.jpg`)
 */
export function extractFilePathFromUrl(url: string): string {
  if (!url) return "";

  // Если это уже относительный путь, возвращаем как есть
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    // Нормализуем /api/uploads/ в /uploads/
    if (url.startsWith("/api/uploads/")) {
      return url.replace("/api/uploads/", "/uploads/");
    }
    return url;
  }

  // Извлекаем путь из CDN URL
  const cdnUrl = getCDNUrl();
  if (cdnUrl && url.startsWith(cdnUrl)) {
    const path = url.replace(cdnUrl, "");
    return path.startsWith("/") ? path : `/${path}`;
  }

  // Извлекаем путь из обычного URL
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    return url;
  }
}

/**
 * Нормализует coverImage для отображения в UI (чат, лента новостей).
 * Исправляет: полный URL с другим origin → относительный путь; /uploads/ → /api/uploads/.
 */
export function normalizeCoverImageForDisplay(
  coverImage: string | null | undefined
): string | null {
  if (!coverImage || typeof coverImage !== "string") return null;
  const s = coverImage.trim();
  if (!s) return null;
  if (s.startsWith("data:")) return s;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const pathname = new URL(s).pathname;
      if (pathname.startsWith("/api/uploads/")) return pathname;
      if (pathname.startsWith("/uploads/")) return pathname.replace("/uploads/", "/api/uploads/");
      return pathname;
    } catch {
      return s;
    }
  }
  if (s.startsWith("/uploads/") && !s.startsWith("/api/uploads/"))
    return s.replace("/uploads/", "/api/uploads/");
  if (s.startsWith("/api/uploads/")) return s;
  return getFileUrlWithCDN(s);
}

/**
 * Получает URL для файла документа
 */
export function getDocumentUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";

  // Если это уже полный URL
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  // Если это путь к документу, используем CDN для documents
  if (filePath.includes("/documents/") || filePath.includes("documents-")) {
    const filename = filePath.split("/").pop() || filePath;
    return getFileUrlByCategory("documents", filename);
  }

  return getFileUrlWithCDN(filePath);
}

/**
 * Получает URL статической иконки через CDN (favicon, apple-touch-icon и т.д.)
 * 
 * @param iconPath - Путь к иконке (например, "/favicon.ico", "/apple-touch-icon.png")
 * @param useCDN - Использовать ли CDN (по умолчанию true, если CDN настроен)
 * @returns Полный URL иконки с CDN или относительный путь
 * 
 * @example
 * // С CDN: "https://cdn.myunion.pro/favicon.ico"
 * // Без CDN: "/favicon.ico"
 */
export function getIconUrl(iconPath: string, useCDN: boolean = true): string {
  if (!iconPath) return "";
  
  // Если это уже полный URL, возвращаем как есть
  if (iconPath.startsWith("http://") || iconPath.startsWith("https://")) {
    return iconPath;
  }
  
  // Убираем начальный слеш для консистентности
  const normalizedPath = iconPath.startsWith("/") ? iconPath.slice(1) : iconPath;
  
  const cdnUrl = useCDN ? getCDNUrl() : null;
  
  if (cdnUrl) {
    return `${cdnUrl}/${normalizedPath}`;
  }
  
  // Без CDN возвращаем относительный путь
  return `/${normalizedPath}`;
}

