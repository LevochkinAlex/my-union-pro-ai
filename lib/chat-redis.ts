/**
 * Redis утилиты для чатов
 * Оптимизировано для масштабирования на 20+ млн пользователей
 * ВАЖНО: Использовать ТОЛЬКО на сервере!
 */

import type { Redis } from "ioredis";

let redisClient: Redis | null = null;

async function getRedisClient(): Promise<Redis | null> {
  if (redisClient && redisClient.status === "ready") {
    return redisClient;
  }

  // Проверяем, что мы на сервере
  if (typeof window !== "undefined") {
    return null;
  }

  try {
    // Динамический импорт для избежания проблем при сборке
    const { default: Redis } = await import("ioredis");
    const { getRedisOptions } = await import("./redis");
    const options = getRedisOptions();
    redisClient = new Redis(options);
    
    redisClient.on("error", (err) => {
      console.error("[chat-redis] Connection error:", err.message);
      redisClient = null;
    });

    redisClient.on("connect", () => {
      console.log("[chat-redis] ✅ Connected");
    });

    return redisClient;
  } catch (error) {
    console.error("[chat-redis] Failed to create client:", error);
    return null;
  }
}

// ============================================================================
// TYPING INDICATORS
// ============================================================================

/**
 * Устанавливает typing indicator для пользователя в чате
 * TTL: 5 секунд (автоматически истекает)
 */
export async function setTypingIndicator(
  chatId: string,
  userId: string,
  userName: string
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  const key = `chat:typing:${chatId}:${userId}`;
  const value = JSON.stringify({ userId, userName, timestamp: Date.now() });
  
  try {
    await client.setex(key, 5, value); // TTL: 5 секунд
  } catch (error) {
    console.error("[chat-redis] Error setting typing indicator:", error);
  }
}

/**
 * Удаляет typing indicator
 */
export async function removeTypingIndicator(
  chatId: string,
  userId: string
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  const key = `chat:typing:${chatId}:${userId}`;
  
  try {
    await client.del(key);
  } catch (error) {
    console.error("[chat-redis] Error removing typing indicator:", error);
  }
}

/**
 * Получает всех пользователей, которые печатают в чате
 */
export async function getTypingUsers(chatId: string): Promise<Array<{ userId: string; userName: string }>> {
  const client = await getRedisClient();
  if (!client) return [];

  const pattern = `chat:typing:${chatId}:*`;
  
  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) return [];

    const values = await client.mget(keys);
    const users: Array<{ userId: string; userName: string }> = [];

    for (const value of values) {
      if (value) {
        try {
          const data = JSON.parse(value);
          users.push({ userId: data.userId, userName: data.userName });
        } catch (e) {
          // Игнорируем некорректные значения
        }
      }
    }

    return users;
  } catch (error) {
    console.error("[chat-redis] Error getting typing users:", error);
    return [];
  }
}

// ============================================================================
// ONLINE STATUS
// ============================================================================

/**
 * Обновляет онлайн статус пользователя
 * TTL: 3 минуты (пользователь считается онлайн если активен в последние 3 минуты)
 */
export async function updateUserOnlineStatus(userId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  const key = `user:online:${userId}`;
  
  try {
    await client.setex(key, 180, "1"); // TTL: 3 минуты
  } catch (error) {
    console.error("[chat-redis] Error updating online status:", error);
  }
}

/**
 * Проверяет, онлайн ли пользователь
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  const key = `user:online:${userId}`;
  
  try {
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    console.error("[chat-redis] Error checking online status:", error);
    return false;
  }
}

/**
 * Получает онлайн статусы для списка пользователей
 * Оптимизировано для массовых запросов
 */
export async function getUsersOnlineStatus(userIds: string[]): Promise<Map<string, boolean>> {
  const client = await getRedisClient();
  if (!client) return new Map();

  const result = new Map<string, boolean>();
  
  if (userIds.length === 0) return result;

  try {
    // Используем pipeline для массовых запросов
    const pipeline = client.pipeline();
    const keys = userIds.map(id => `user:online:${id}`);
    
    keys.forEach(key => {
      pipeline.exists(key);
    });

    const results = await pipeline.exec();
    
    if (results) {
      results.forEach(([err, value], index) => {
        if (!err && value !== null) {
          const userId = userIds[index];
          result.set(userId, value === 1);
        }
      });
    }
  } catch (error) {
    console.error("[chat-redis] Error getting users online status:", error);
  }

  return result;
}

// ============================================================================
// CHAT CACHE INVALIDATION
// ============================================================================

/**
 * Инвалидирует кэш списка чатов для пользователя
 */
export async function invalidateUserChatsCache(userId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    console.warn(`[chat-redis] Cannot invalidate cache - Redis client not available`);
    return;
  }

  try {
    const pattern = `user:chats:${userId}:*`;
    const keys = await client.keys(pattern);
    
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`[chat-redis] ✅ Invalidated ${keys.length} cache keys for user ${userId}:`, keys);
    } else {
      console.log(`[chat-redis] No cache keys found for user ${userId}`);
    }
  } catch (error) {
    console.error("[chat-redis] ❌ Error invalidating chats cache:", error);
    throw error; // Пробрасываем ошибку для обработки выше
  }
}

/**
 * Инвалидирует кэш конкретного чата
 */
export async function invalidateChatCache(chatId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    // Инвалидируем кэш сообщений чата
    const messageCacheKey = `chat:messages:${chatId}:*`;
    const messageKeys = await client.keys(messageCacheKey);
    if (messageKeys.length > 0) {
      await client.del(...messageKeys);
    }

    // Инвалидируем кэш данных чата
    const chatDataKey = `chat:data:${chatId}`;
    await client.del(chatDataKey);

    // Инвалидируем кэш для всех участников чата
    const chat = await import("@/lib/prisma").then(m => m.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        participants: {
          select: { userId: true },
        },
      },
    }));

    if (chat) {
      await Promise.all(
        chat.participants.map(p => invalidateUserChatsCache(p.userId))
      );
    }
  } catch (error) {
    console.error("[chat-redis] Error invalidating chat cache:", error);
  }
}

// ============================================================================
// MESSAGE CACHE
// ============================================================================

/**
 * Кэширует сообщения чата в Redis
 * TTL: 5 минут (сообщения могут обновляться часто)
 */
export async function cacheChatMessages(
  chatId: string,
  messages: any[],
  cursor?: string,
  direction?: string
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    const cacheKey = `chat:messages:${chatId}:${cursor || 'latest'}:${direction || 'newer'}`;
    const value = JSON.stringify(messages);
    
    // Кэшируем на 5 минут
    await client.setex(cacheKey, 300, value);
  } catch (error) {
    console.error("[chat-redis] Error caching messages:", error);
  }
}

/**
 * Получает кэшированные сообщения чата из Redis
 */
export async function getCachedChatMessages(
  chatId: string,
  cursor?: string,
  direction?: string
): Promise<any[] | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const cacheKey = `chat:messages:${chatId}:${cursor || 'latest'}:${direction || 'newer'}`;
    const value = await client.get(cacheKey);
    
    if (value) {
      return JSON.parse(value);
    }
  } catch (error) {
    console.error("[chat-redis] Error getting cached messages:", error);
  }

  return null;
}

/**
 * Кэширует данные чата (без сообщений)
 * TTL: 10 минут (данные чата меняются реже)
 */
export async function cacheChatData(chatId: string, chatData: any): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    const cacheKey = `chat:data:${chatId}`;
    const value = JSON.stringify(chatData);
    
    // Кэшируем на 10 минут
    await client.setex(cacheKey, 600, value);
  } catch (error) {
    console.error("[chat-redis] Error caching chat data:", error);
  }
}

/**
 * Получает кэшированные данные чата из Redis
 */
export async function getCachedChatData(chatId: string): Promise<any | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const cacheKey = `chat:data:${chatId}`;
    const value = await client.get(cacheKey);
    
    if (value) {
      return JSON.parse(value);
    }
  } catch (error) {
    console.error("[chat-redis] Error getting cached chat data:", error);
  }

  return null;
}
