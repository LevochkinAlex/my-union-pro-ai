import type { RedisOptions } from "ioredis";

/** Resolved once: either Redis options, or `null` if Redis отключён явно (`REDIS_URL=`). */
let cachedOptions: RedisOptions | null | undefined;

/**
 * Параметры подключения к Redis.
 * - `REDIS_URL` не задан → по умолчанию `redis://localhost:6379` (как раньше).
 * - `REDIS_URL=` (пустая строка) → `null` — без подключения (удобно для локалки без Redis).
 */
export function getRedisOptions(): RedisOptions | null {
  if (cachedOptions !== undefined) {
    return cachedOptions;
  }

  const raw = process.env.REDIS_URL;
  if (raw !== undefined && raw.trim() === "") {
    cachedOptions = null;
    return null;
  }

  const url = raw?.trim() || "redis://localhost:6379";

  const parsedUrl = new URL(url);

  cachedOptions = {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 6379),
    username: parsedUrl.username || undefined,
    password: parsedUrl.password || undefined,
    tls: parsedUrl.protocol === "rediss:" ? {} : undefined,
  } satisfies RedisOptions;

  return cachedOptions;
}
