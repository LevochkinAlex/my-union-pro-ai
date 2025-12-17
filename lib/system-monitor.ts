import os from "os";
import { prisma } from "./prisma";
import { cacheGet } from "./cache";

interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number; // Процент использования CPU
    loadAverage: number[];
  };
  memory: {
    total: number; // В байтах
    free: number; // В байтах
    used: number; // В байтах
    usage: number; // Процент использования
  };
  disk: {
    total: number; // В байтах
    free: number; // В байтах
    used: number; // В байтах
    usage: number; // Процент использования
  };
  database: {
    connections: number;
    slowQueries: number; // За последний час
  };
  redis: {
    connected: boolean;
    memory: number; // Использование памяти в байтах
    keys: number; // Количество ключей
  };
}

/**
 * Получить системные метрики
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const timestamp = Date.now();

  // CPU
  const cpus = os.cpus();
  const cpuUsage = calculateCPUUsage();
  const loadAverage = os.loadavg();

  // Memory
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;

  // Disk (упрощенная версия, для Linux)
  const diskStats = await getDiskStats();

  // Database
  const dbStats = await getDatabaseStats();

  // Redis
  const redisStats = await getRedisStats();

  return {
    timestamp,
    cpu: {
      usage: cpuUsage,
      loadAverage: loadAverage,
    },
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: usedMemory,
      usage: Math.round(memoryUsage * 100) / 100,
    },
    disk: diskStats,
    database: dbStats,
    redis: redisStats,
  };
}

/**
 * Вычисление использования CPU
 */
function calculateCPUUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~((100 * idle) / total);

  return Math.max(0, Math.min(100, usage));
}

/**
 * Получить статистику диска
 * Упрощенная версия - для полной функциональности нужна библиотека типа 'node-disk-info'
 */
async function getDiskStats(): Promise<{
  total: number;
  free: number;
  used: number;
  usage: number;
}> {
  try {
    // Для Linux используем команду df через child_process
    // Для других систем можно использовать библиотеку 'node-disk-info'
    const { execSync } = await import("child_process");
    
    if (process.platform === "linux") {
      try {
        const output = execSync("df -B1 / | tail -1", { encoding: "utf-8" });
        const parts = output.trim().split(/\s+/);
        
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10);
          const used = parseInt(parts[2], 10);
          const free = parseInt(parts[3], 10);
          const usage = (used / total) * 100;

          return {
            total,
            free,
            used,
            usage: Math.round(usage * 100) / 100,
          };
        }
      } catch (error) {
        console.error("[SystemMonitor] Error executing df command:", error);
      }
    }
  } catch (error) {
    console.error("[SystemMonitor] Error getting disk stats:", error);
  }

  // Fallback: возвращаем нули если не удалось получить
  return {
    total: 0,
    free: 0,
    used: 0,
    usage: 0,
  };
}

/**
 * Получить статистику БД
 */
async function getDatabaseStats(): Promise<{
  connections: number;
  slowQueries: number;
}> {
  try {
    // Получаем количество активных соединений
    // Prisma не предоставляет прямой API, используем запрос к БД
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;

    const connections = Number(result[0]?.count || 0);

    // Медленные запросы за последний час (если есть логирование)
    // Это требует настройки pg_stat_statements в PostgreSQL
    const slowQueries = 0; // TODO: Реализовать через pg_stat_statements

    return {
      connections,
      slowQueries,
    };
  } catch (error) {
    console.error("[SystemMonitor] Error getting database stats:", error);
    return {
      connections: 0,
      slowQueries: 0,
    };
  }
}

/**
 * Получить статистику Redis
 */
async function getRedisStats(): Promise<{
  connected: boolean;
  memory: number;
  keys: number;
}> {
  try {
    const { getRedisOptions } = await import("./redis");
    const { Redis } = await import("ioredis");

    const options = getRedisOptions();
    const client = new Redis(options);

    try {
      const info = await client.info("memory");
      const keys = await client.dbsize();

      // Парсим информацию о памяти
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memory = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;

      await client.quit();

      return {
        connected: true,
        memory,
        keys: keys || 0,
      };
    } catch (error) {
      await client.quit();
      throw error;
    }
  } catch (error) {
    console.error("[SystemMonitor] Error getting Redis stats:", error);
    return {
      connected: false,
      memory: 0,
      keys: 0,
    };
  }
}

/**
 * Сохранить метрики в кеш для истории
 */
export async function saveMetrics(metrics: SystemMetrics): Promise<void> {
  try {
    const { cacheSet } = await import("./cache");
    const key = `system:metrics:${Math.floor(metrics.timestamp / 60000)}`; // Ключ по минутам
    await cacheSet(key, metrics, 3600 * 24); // Храним 24 часа
  } catch (error) {
    console.error("[SystemMonitor] Error saving metrics:", error);
  }
}

/**
 * Получить историю метрик
 */
export async function getMetricsHistory(
  minutes: number = 60
): Promise<SystemMetrics[]> {
  try {
    const { cacheGet } = await import("./cache");
    const now = Date.now();
    const metrics: SystemMetrics[] = [];

    for (let i = 0; i < minutes; i++) {
      const timestamp = now - i * 60000;
      const key = `system:metrics:${Math.floor(timestamp / 60000)}`;
      const metric = await cacheGet<SystemMetrics>(key);
      if (metric) {
        metrics.push(metric);
      }
    }

    return metrics.reverse(); // Старые сначала
  } catch (error) {
    console.error("[SystemMonitor] Error getting metrics history:", error);
    return [];
  }
}

