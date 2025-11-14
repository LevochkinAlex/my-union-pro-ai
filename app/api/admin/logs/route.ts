import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Logger } from "@/lib/logger";
import type { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Get recent system logs for admin panel
 * GET /api/admin/logs?limit=50&level=ERROR&resolved=false
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check authorization - only super admins
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admins can view system logs" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const levelParam = searchParams.get("level");
    const logLevel = levelParam ? (levelParam as LogLevel) : undefined;
    const resolved = searchParams.get("resolved");
    const source = searchParams.get("source");

    let logsPromise;

    if (source) {
      // Get logs by specific source
      logsPromise = Logger.getLogsBySource(source, limit);
    } else {
      // Get recent logs
      logsPromise = Logger.getRecentLogs(limit, logLevel, resolved !== null ? resolved === "true" : undefined);
    }

    const [logs, stats] = await Promise.all([logsPromise, Logger.getLogsStats()]);

    return NextResponse.json({
      success: true,
      logs,
      stats,
      pagination: {
        limit,
        count: logs.length,
      },
    });
  } catch (error) {
    console.error("[logs] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch logs",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Resolve a system log entry
 * PATCH /api/admin/logs/[id]
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check authorization - only super admins
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admins can resolve logs" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { logId } = body;

    if (!logId) {
      return NextResponse.json({ error: "logId is required" }, { status: 400 });
    }

    await Logger.resolveLog(logId, session.user.id);

    return NextResponse.json({
      success: true,
      message: "Log resolved successfully",
    });
  } catch (error) {
    console.error("[logs] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to resolve log",
      },
      { status: 500 }
    );
  }
}

/**
 * Clear old logs (older than 30 days)
 * DELETE /api/admin/logs?older_than_days=30
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check authorization - only super admins
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admins can delete logs" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get("older_than_days") || "30");

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await prisma.systemLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        resolved: true, // Only delete resolved logs
      },
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} old logs`,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("[logs] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete logs",
      },
      { status: 500 }
    );
  }
}

