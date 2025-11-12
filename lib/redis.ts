import type { RedisOptions } from "ioredis";

let cachedOptions: RedisOptions | null = null;

export function getRedisOptions(): RedisOptions {
  if (cachedOptions) {
    return cachedOptions;
  }

  const url = process.env.REDIS_URL || "redis://localhost:6379";

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
