import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { getSystemMetrics, saveMetrics, getMetricsHistory } from "@/lib/system-monitor";

// GET /api/admin/system-metrics - получить текущие метрики системы
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что это супер-админ
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const searchParams = request.nextUrl.searchParams;
    const history = searchParams.get("history") === "true";
    const minutes = parseInt(searchParams.get("minutes") || "60");

    if (history) {
      // Возвращаем историю метрик
      const metrics = await getMetricsHistory(minutes);
      return NextResponse.json({
        metrics,
        count: metrics.length,
      });
    }

    // Возвращаем текущие метрики
    const metrics = await getSystemMetrics();
    
    // Сохраняем метрики для истории (асинхронно, не блокируем ответ)
    saveMetrics(metrics).catch(() => {});

    return NextResponse.json({
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[admin/system-metrics] Error:", error);
    return NextResponse.json(
      { error: "Ошибка получения метрик" },
      { status: 500 }
    );
  }
}

