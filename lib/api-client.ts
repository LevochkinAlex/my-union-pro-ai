/**
 * Утилиты для безопасных API запросов с retry-логикой
 * ТОЛЬКО для клиентского кода (use client)
 */

'use client';

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000, // 1 секунда
  retryableStatuses: [503, 508, 500, 502, 504], // Повторяем при этих статусах
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

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000), // 30 секунд таймаут
      });

      // Если успешный ответ или не повторяемый статус - возвращаем сразу
      if (response.ok || !config.retryableStatuses.includes(response.status)) {
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

      // Логируем попытку повтора
      console.warn(
        `[fetchWithRetry] Attempt ${attempt + 1}/${config.maxRetries + 1} failed with error:`,
        lastError.message
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
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[fetchJsonWithRetry] Request failed: ${response.status} ${response.statusText}`, {
        url,
        status: response.status,
        error: errorText.substring(0, 200),
      });
      return null;
    }

    return await safeJsonParse<T>(response);
  } catch (error) {
    console.error('[fetchJsonWithRetry] Request error:', error);
    return null;
  }
}
