import { Redis } from "ioredis";
import { getRedisOptions } from "./redis";

let redisClient: Redis | null = null;
let initPromise: Promise<void> | null = null;

// Инициализируем Redis при загрузке модуля (на сервере), если Redis не отключён (`REDIS_URL=`)
if (typeof window === "undefined" && getRedisOptions() !== null) {
  initPromise = initRedisConnection();
}

async function initRedisConnection(): Promise<void> {
  try {
    const client = getRedisClient();
    if (client) {
      // Ждём готовности Redis
      await new Promise<void>((resolve, reject) => {
        if (client.status === "ready") {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          reject(new Error("Redis connection timeout"));
        }, 5000);
        client.once("ready", () => {
          clearTimeout(timeout);
          resolve();
        });
        client.once("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }
  } catch (error) {
    console.warn("[Redis] Initial connection failed, will retry on demand:", error);
  }
}

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
    if (!options) {
      return null;
    }
    redisClient = new Redis({
      ...options,
      retryStrategy: (times) => {
        if (times > 10) {
          // После 10 попыток прекращаем
          return null;
        }
        // Экспоненциальная задержка с максимумом 3 секунды
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      maxRetriesPerRequest: null, // Не ограничиваем количество попыток
      lazyConnect: false, // Подключаемся сразу
      connectTimeout: 5000, // 5 секунд таймаут
      keepAlive: 30000, // Keep-alive каждые 30 секунд
      enableReadyCheck: true, // Проверка готовности перед выполнением команд
      enableOfflineQueue: true, // Включаем очередь для работы при временных отключениях
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
  if (!client || client.status !== "ready") {
    return null;
  }

  try {
    const value = await client.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as T;
  } catch (error: any) {
    // Не логируем ошибки подключения - это нормально при временных проблемах
    if (error?.message && !error.message.includes("Stream isn't writeable")) {
      console.error(`[Cache] Error getting key ${key}:`, error.message);
    }
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
  if (!client || client.status !== "ready") {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await client.setex(key, ttlSeconds, serialized);
    return true;
  } catch (error: any) {
    // Не логируем ошибки подключения - это нормально при временных проблемах
    if (error?.message && !error.message.includes("Stream isn't writeable")) {
      console.error(`[Cache] Error setting key ${key}:`, error.message);
    }
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
 * ВАЖНО: Всегда выполняет функцию, даже если Redis недоступен
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  // Пытаемся получить из кеша (если Redis доступен)
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Выполняем функцию (всегда, даже если Redis недоступен)
  const result = await fn();

  // Сохраняем в кеш (если Redis доступен, иначе просто игнорируем)
  await cacheSet(key, result, ttlSeconds).catch(() => {
    // Игнорируем ошибки сохранения в кеш - это не критично
  });

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

