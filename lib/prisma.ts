import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    // Увеличиваем таймауты для предотвращения 503 ошибок
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

// Создаем инстанс только на сервере
let prismaInstance: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prismaInstance = createPrismaClient();
} else {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  prismaInstance = globalForPrisma.prisma;
}

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await prismaInstance.$disconnect();
  });
}

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
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убрали Promise.race с таймаутом
      // Prisma сам управляет таймаутами через connection pool
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Проверяем, является ли это ошибкой подключения
      const isConnectionError = 
        error?.code === 'P1001' || // Can't reach database server
        error?.code === 'P1002' || // Database server doesn't accept connections
        error?.code === 'P1008' || // Operations timed out
        error?.code === 'P1017' || // Server has closed the connection
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('ENOTFOUND') ||
        error?.message?.includes('Connection') ||
        error?.message?.includes('connect');
      
      if (isConnectionError && attempt < maxRetries) {
        const retryDelay = delay * Math.pow(2, attempt); // Exponential backoff
        console.warn(`[prisma] Connection error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${retryDelay}ms...`, {
          code: error?.code,
          message: error?.message?.substring(0, 100),
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      // Если это не ошибка подключения или закончились попытки, пробрасываем ошибку
      throw error;
    }
  }
  
  throw lastError;
}

export const prisma = prismaInstance;

