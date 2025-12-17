import { cacheDeletePattern } from "./cache";

/**
 * Инвалидация кеша для различных сущностей
 */

/**
 * Инвалидировать кеш списка пользователей
 */
export async function invalidateUsersCache() {
  await cacheDeletePattern("users:list:*");
  console.log("[Cache] Invalidated users cache");
}

/**
 * Инвалидировать кеш списка организаций
 */
export async function invalidateOrganizationsCache() {
  await cacheDeletePattern("organizations:list:*");
  console.log("[Cache] Invalidated organizations cache");
}

/**
 * Инвалидировать кеш списка постов
 */
export async function invalidatePostsCache(userId?: string) {
  await cacheDeletePattern("posts:list:*");
  console.log("[Cache] Invalidated posts cache", userId ? `for user ${userId}` : "");
}

/**
 * Инвалидировать кеш списка новостей
 */
export async function invalidateNewsCache() {
  await cacheDeletePattern("news:list:*");
  console.log("[Cache] Invalidated news cache");
}

/**
 * Инвалидировать весь кеш (использовать осторожно!)
 */
export async function invalidateAllCache() {
  await Promise.all([
    invalidateUsersCache(),
    invalidateOrganizationsCache(),
    invalidatePostsCache(),
    invalidateNewsCache(),
  ]);
  console.log("[Cache] Invalidated all cache");
}

