/**
 * Утилиты для безопасных API запросов с retry-логикой
 * ТОЛЬКО для клиентского кода (use client)
 */

'use client';

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatuses?: number[];
  /** Таймаут запроса в мс (по умолчанию 30000) */
  timeoutMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000, // 1 секунда
  retryableStatuses: [503, 508, 500, 502, 504], // Повторяем при этих статусах
  timeoutMs: 30000,
};

/**
 * Выполняет fetch с retry-логикой для неудачных запросов
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;

  const timeoutMs = retryOptions.timeoutMs ?? 30000;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      });

      // Если успешный ответ - возвращаем сразу
      if (response.ok) {
        return response;
      }

      // Если это не повторяемый статус (например, 401, 403, 404) - возвращаем сразу
      if (!config.retryableStatuses.includes(response.status)) {
        return response;
      }

      // Если это последняя попытка - возвращаем ответ как есть
      if (attempt === config.maxRetries) {
        return response;
      }

      // Логируем попытку повтора
      console.warn(
        `[fetchWithRetry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed with status ${response.status}, retrying...`
      );

      // Ждем перед повтором с экспоненциальной задержкой
      await new Promise((resolve) =>
        setTimeout(resolve, config.retryDelay * Math.pow(2, attempt))
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Если это последняя попытка - пробрасываем ошибку
      if (attempt === config.maxRetries) {
        throw lastError;
      }

      const isTimeout = /timeout|timed out/i.test(lastError.message);
      console.warn(
        `[fetchWithRetry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed${isTimeout ? ` (таймаут — ответ сервера дольше ${timeoutMs} мс)` : ": " + lastError.message}`
      );

      // Ждем перед повтором
      await new Promise((resolve) =>
        setTimeout(resolve, config.retryDelay * Math.pow(2, attempt))
      );
    }
  }

  // Этот код не должен выполняться, но TypeScript требует возврат
  throw lastError || new Error('Failed to fetch after retries');
}

/**
 * Безопасный парсинг JSON из Response (клиентская версия)
 * Экспортируем для использования в клиентских компонентах
 */
export async function safeJsonParse<T = any>(response: Response): Promise<T | null> {
  try {
    const contentType = response.headers.get('content-type');
    
    // Проверяем, что ответ действительно JSON
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[safeJsonParse] Response is not JSON:', {
        status: response.status,
        statusText: response.statusText,
        contentType,
        preview: text.substring(0, 100),
      });
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[safeJsonParse] Failed to parse JSON:', error);
    return null;
  }
}

/**
 * Выполняет fetch с retry и автоматически парсит JSON
 */
export async function fetchJsonWithRetry<T = any>(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T | null> {
  try {
    const response = await fetchWithRetry(url, options, retryOptions);
    
    if (!response.ok) {
      // Пытаемся получить JSON с ошибкой, если это возможно
      let errorData: any = null;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          errorData = await response.json();
        } else {
          const errorText = await response.text();
          errorData = { error: errorText.substring(0, 200) };
        }
      } catch {
        errorData = { error: 'Unknown error' };
      }
      
      const isServerUnavailable = [502, 503, 504].includes(response.status);
      if (isServerUnavailable) {
        console.warn(`[fetchJsonWithRetry] Server unavailable: ${response.status}`, url);
      } else {
        console.error(`[fetchJsonWithRetry] Request failed: ${response.status} ${response.statusText}`, {
          url,
          status: response.status,
          error: errorData,
        });
      }
      return null;
    }

    const result = await safeJsonParse<T>(response);
    
    // Логируем успешные ответы для отладки (только в dev режиме)
    if (process.env.NODE_ENV === 'development' && result === null) {
      console.warn('[fetchJsonWithRetry] Parsed result is null for successful response:', url);
    }
    
    return result;
  } catch (error: unknown) {
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (isTimeout) {
      console.warn(`[fetchJsonWithRetry] Request timeout: ${url}`);
    } else {
      console.error('[fetchJsonWithRetry] Request error:', error, { url });
    }
    return null;
  }
}
