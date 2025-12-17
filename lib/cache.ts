import { Redis } from "ioredis";
import { getRedisOptions } from "./redis";

let redisClient: Redis | null = null;

/**
 * Получить или создать Redis клиент
 */
function getRedisClient(): Redis | null {
  if (redisClient && redisClient.status === "ready") {
    return redisClient;
  }

  // Если клиент существует, но не готов, пересоздаем
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch (e) {
      // Игнорируем ошибки при отключении
    }
    redisClient = null;
  }

  try {
    const options = getRedisOptions();
    redisClient = new Redis({
      ...options,
      retryStrategy: (times) => {
        // Экспоненциальная задержка с максимумом 3 секунды
        const delay = Math.min(times * 50, 3000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: false, // Подключаемся сразу
      connectTimeout: 5000, // 5 секунд таймаут
      keepAlive: 30000, // Keep-alive каждые 30 секунд
      enableReadyCheck: true, // Проверка готовности перед выполнением команд
      enableOfflineQueue: false, // Не ставить команды в очередь при отключении
    });
    
    redisClient.on("error", (err) => {
      // Не логируем каждую ошибку, только критичные
      if (err.message && !err.message.includes("ECONNREFUSED")) {
        console.error("[Redis] Connection error:", err.message);
      }
      // Не сбрасываем клиент сразу, даем возможность переподключиться
    });

    redisClient.on("connect", () => {
      console.log("[Redis] ✅ Connected successfully");
    });

    redisClient.on("ready", () => {
      console.log("[Redis] ✅ Ready to accept commands");
    });

    redisClient.on("close", () => {
      console.log("[Redis] Connection closed");
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    console.error("[Redis] Failed to create client:", error);
    return null;
  }
}

/**
 * Кеширование с автоматической сериализацией
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) {
    return null; // Если Redis недоступен, возвращаем null
  }

  try {
    const value = await client.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`[Cache] Error getting key ${key}:`, error);
    return null;
  }
}

/**
 * Сохранение в кеш с TTL
 */
export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds: number = 300 // По умолчанию 5 минут
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await client.setex(key, ttlSeconds, serialized);
    return true;
  } catch (error) {
    console.error(`[Cache] Error setting key ${key}:`, error);
    return false;
  }
}

/**
 * Удаление из кеша
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error(`[Cache] Error deleting key ${key}:`, error);
    return false;
  }
}

/**
 * Удаление по паттерну (для инвалидации кеша)
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) {
    return 0;
  }

  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }
    return await client.del(...keys);
  } catch (error) {
    console.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    return 0;
  }
}

/**
 * Генерация ключа кеша для API запросов
 */
export function getCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}:${JSON.stringify(params[key])}`)
    .join("|");
  return `${prefix}:${sortedParams}`;
}

/**
 * Обертка для кеширования результатов функции
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  // Пытаемся получить из кеша
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Выполняем функцию
  const result = await fn();

  // Сохраняем в кеш
  await cacheSet(key, result, ttlSeconds);

  return result;
}

/**
 * Закрытие соединения с Redis (для graceful shutdown)
 */
export async function closeCacheConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

