import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { getPerformanceStats } from "@/lib/performance-monitor";
import { ensureSuperAdmin } from "@/lib/admin-auth";

// GET /api/admin/performance - получить статистику производительности
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

    const stats = await getPerformanceStats();

    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[admin/performance] Error:", error);
    return NextResponse.json(
      { error: "Ошибка получения статистики" },
      { status: 500 }
    );
  }
}

