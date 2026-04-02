import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/sync-logs
 * Получение истории синхронизаций
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const url = new URL(request.url);
    const typesParam = url.searchParams.get("types");
    const type = url.searchParams.get("type");
    const limit = parseInt(url.searchParams.get("limit") || "10");

    const typeFilter =
      typesParam && typesParam.trim().length > 0
        ? {
            type: {
              in: typesParam
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            },
          }
        : type
          ? { type }
          : undefined;

    const logs = await prisma.syncLog.findMany({
      where: typeFilter,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("[sync-logs] Error:", error);
    return NextResponse.json({ error: "Ошибка получения логов" }, { status: 500 });
  }
}

