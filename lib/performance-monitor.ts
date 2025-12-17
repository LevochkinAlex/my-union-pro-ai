import { cacheGet, cacheSet } from "./cache";

interface PerformanceMetric {
  endpoint: string;
  method: string;
  duration: number;
  timestamp: number;
  statusCode: number;
  cacheHit: boolean;
  userId?: string;
}

const METRICS_KEY = "performance:metrics";
const MAX_METRICS = 1000; // Храним последние 1000 метрик
const SLOW_QUERY_THRESHOLD = 500; // 500ms

/**
 * Логирование метрики производительности
 */
export async function logPerformanceMetric(metric: PerformanceMetric) {
  try {
    // Логируем медленные запросы
    if (metric.duration > SLOW_QUERY_THRESHOLD) {
      console.warn(
        `[Performance] Slow query: ${metric.method} ${metric.endpoint} took ${metric.duration}ms`,
        {
          statusCode: metric.statusCode,
          cacheHit: metric.cacheHit,
          userId: metric.userId,
        }
      );
    }

    // Сохраняем метрику в Redis (опционально, для анализа)
    const metrics = await getMetrics();
    metrics.push(metric);

    // Ограничиваем количество метрик
    if (metrics.length > MAX_METRICS) {
      metrics.shift(); // Удаляем старые метрики
    }

    // Сохраняем в кеш (TTL 1 час)
    await cacheSet(METRICS_KEY, metrics, 3600);
  } catch (error) {
    // Не прерываем выполнение при ошибке логирования
    console.error("[Performance] Error logging metric:", error);
  }
}

/**
 * Получить метрики производительности
 */
export async function getMetrics(): Promise<PerformanceMetric[]> {
  try {
    const metrics = await cacheGet<PerformanceMetric[]>(METRICS_KEY);
    return metrics || [];
  } catch (error) {
    console.error("[Performance] Error getting metrics:", error);
    return [];
  }
}

/**
 * Получить статистику производительности
 */
export async function getPerformanceStats() {
  const metrics = await getMetrics();
  
  if (metrics.length === 0) {
    return {
      total: 0,
      average: 0,
      slow: 0,
      cacheHitRate: 0,
      byEndpoint: {},
    };
  }

  const total = metrics.length;
  const average = metrics.reduce((sum, m) => sum + m.duration, 0) / total;
  const slow = metrics.filter((m) => m.duration > SLOW_QUERY_THRESHOLD).length;
  const cacheHits = metrics.filter((m) => m.cacheHit).length;
  const cacheHitRate = (cacheHits / total) * 100;

  // Группировка по эндпоинтам
  const byEndpoint: Record<string, {
    count: number;
    average: number;
    slow: number;
    cacheHitRate: number;
  }> = {};

  metrics.forEach((metric) => {
    const key = `${metric.method} ${metric.endpoint}`;
    if (!byEndpoint[key]) {
      byEndpoint[key] = {
        count: 0,
        average: 0,
        slow: 0,
        cacheHitRate: 0,
      };
    }

    byEndpoint[key].count++;
    byEndpoint[key].average += metric.duration;
    if (metric.duration > SLOW_QUERY_THRESHOLD) {
      byEndpoint[key].slow++;
    }
    if (metric.cacheHit) {
      byEndpoint[key].cacheHitRate++;
    }
  });

  // Вычисляем средние значения
  Object.keys(byEndpoint).forEach((key) => {
    const stats = byEndpoint[key];
    stats.average = stats.average / stats.count;
    stats.cacheHitRate = (stats.cacheHitRate / stats.count) * 100;
  });

  return {
    total,
    average: Math.round(average),
    slow,
    slowPercentage: Math.round((slow / total) * 100),
    cacheHitRate: Math.round(cacheHitRate * 100) / 100,
    byEndpoint,
  };
}

/**
 * Обертка для измерения производительности API endpoint
 */
export function withPerformanceMonitoring<T>(
  endpoint: string,
  method: string,
  handler: (cacheHit: boolean) => Promise<T>,
  userId?: string
): Promise<T> {
  const startTime = Date.now();
  let cacheHit = false;
  let statusCode = 200;

  return handler(cacheHit)
    .then(async (result) => {
      const duration = Date.now() - startTime;
      
      // Логируем метрику асинхронно (не блокируем ответ)
      logPerformanceMetric({
        endpoint,
        method,
        duration,
        timestamp: Date.now(),
        statusCode,
        cacheHit,
        userId,
      }).catch(() => {}); // Игнорируем ошибки логирования

      return result;
    })
    .catch(async (error) => {
      const duration = Date.now() - startTime;
      statusCode = error.statusCode || 500;

      // Логируем ошибку
      logPerformanceMetric({
        endpoint,
        method,
        duration,
        timestamp: Date.now(),
        statusCode,
        cacheHit,
        userId,
      }).catch(() => {});

      throw error;
    });
}

