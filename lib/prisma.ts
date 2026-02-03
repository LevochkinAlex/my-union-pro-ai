import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __prismaInitError: Error | undefined;
};

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    const msg =
      'DATABASE_URL не задан. Добавьте в .env.local и выполните: pnpm prisma generate';
    console.error('[prisma]', msg);
    throw new Error(msg);
  }
  // В dev: предупреждение, если БД не на localhost (часто недоступна с машины разработчика)
  if (process.env.NODE_ENV === 'development') {
    try {
      const url = new URL(process.env.DATABASE_URL.replace(/^postgres:/, 'postgresql:'));
      const host = url.hostname || '';
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        console.warn(
          '[prisma] В dev DATABASE_URL указывает на удалённый хост:',
          host,
          '\n  Если видите "Can\'t reach database server" — в .env.local укажите локальную БД (localhost) или поднимите SSH-туннель:\n  ssh -L 5432:localhost:5432 root@' + host
        );
      }
    } catch {
      // ignore URL parse errors
    }
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

/** Единый экземпляр Prisma: ленивая инициализация при первом обращении. */
function getPrismaClient(): PrismaClient {
  if (globalForPrisma.__prisma) {
    return globalForPrisma.__prisma;
  }
  if (globalForPrisma.__prismaInitError) {
    throw globalForPrisma.__prismaInitError;
  }
  try {
    const client = createPrismaClient();
    globalForPrisma.__prisma = client;
    if (typeof process !== 'undefined') {
      process.on('beforeExit', async () => {
        await client.$disconnect();
      });
    }
    return client;
  } catch (err) {
    const wrapped =
      err instanceof Error
        ? err
        : new Error(err instanceof Error ? err.message : String(err));
    globalForPrisma.__prismaInitError = wrapped;
    console.error('[prisma] Ошибка инициализации:', wrapped.message);
    throw wrapped;
  }
}

/**
 * Экспорт Prisma: один экземпляр через globalThis (совместимо с Next.js + Turbopack).
 * При ошибке инициализации (нет DATABASE_URL или БД недоступна) ошибка кэшируется и пробрасывается при первом обращении.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return (getPrismaClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Обертка для Prisma запросов с обработкой ошибок подключения
 * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убран Promise.race с таймаутом - он вызывал 503 ошибки
 */
export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 500
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isConnectionError =
        error?.code === 'P1001' ||
        error?.code === 'P1002' ||
        error?.code === 'P1008' ||
        error?.code === 'P1017' ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('ENOTFOUND') ||
        error?.message?.includes('Connection') ||
        error?.message?.includes('connect');
      if (isConnectionError && attempt < maxRetries) {
        const retryDelay = delay * Math.pow(2, attempt);
        console.warn(`[prisma] Connection error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${retryDelay}ms...`, {
          code: error?.code,
          message: error?.message?.substring(0, 100),
        });
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

