import { cacheGet } from "./cache";

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
const SLOW_QUERY_THRESHOLD = 500; // 500ms

/**
 * Получить метрики производительности (внутреннее, используется getPerformanceStats).
 */
async function getMetrics(): Promise<PerformanceMetric[]> {
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

