/**
 * Безопасный fetch с обработкой ошибок сервера (503, 500 и т.д.)
 * Используется для не критичных запросов, которые не должны ломать UI
 */

interface SafeFetchOptions extends RequestInit {
  /**
   * Если true, ошибки сервера (5xx) будут проигнорированы
   * @default true
   */
  ignoreServerErrors?: boolean;
  
  /**
   * Если true, ошибки клиента (4xx) также будут проигнорированы
   * @default false
   */
  ignoreClientErrors?: boolean;
  
  /**
   * Логировать ли ошибки в консоль (только в development)
   * @default false
   */
  logErrors?: boolean;
}

/**
 * Безопасный fetch, который не выбрасывает ошибки для не критичных запросов
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response | null> {
  const {
    ignoreServerErrors = true,
    ignoreClientErrors = false,
    logErrors = false,
    ...fetchOptions
  } = options;

  try {
    const response = await fetch(url, fetchOptions);

    // Игнорируем ошибки сервера (5xx)
    if (ignoreServerErrors && response.status >= 500) {
      if (logErrors && process.env.NODE_ENV === 'development') {
        console.warn(`[safeFetch] Server error ${response.status} for ${url}, ignoring`);
      }
      return null;
    }

    // Игнорируем ошибки клиента (4xx) если нужно
    if (ignoreClientErrors && response.status >= 400 && response.status < 500) {
      if (logErrors && process.env.NODE_ENV === 'development') {
        console.warn(`[safeFetch] Client error ${response.status} for ${url}, ignoring`);
      }
      return null;
    }

    return response;
  } catch (error) {
    // Сетевые ошибки и другие исключения
    if (logErrors && process.env.NODE_ENV === 'development') {
      console.warn(`[safeFetch] Network error for ${url}:`, error);
    }
    
    // Если это не критичный запрос, возвращаем null вместо выброса ошибки
    if (ignoreServerErrors) {
      return null;
    }
    
    throw error;
  }
}

/**
 * Безопасный fetch с автоматическим парсингом JSON
 */
export async function safeFetchJson<T = any>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<T | null> {
  const response = await safeFetch(url, options);
  
  if (!response || !response.ok) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    if (options.logErrors && process.env.NODE_ENV === 'development') {
      console.warn(`[safeFetchJson] Failed to parse JSON for ${url}:`, error);
    }
    return null;
  }
}

