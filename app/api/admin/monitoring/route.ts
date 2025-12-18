import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Get system monitoring metrics
 * GET /api/admin/monitoring
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check authorization - only super admins
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admins can view monitoring" },
        { status: 403 }
      );
    }

    // Get PM2 metrics (if available)
    const metrics = {
      status: "online" as const,
      uptime: 0,
      memory: {
        used: 0,
        total: 0,
        percentage: 0,
      },
      cpu: 0,
      restarts: 0,
      responseTime: 0,
    };

    // Test API endpoints
    const apiEndpoints = [
      "/api/health",
      "/api/news?limit=1",
      "/api/users?limit=1",
    ];

    const apiHealth = await Promise.all(
      apiEndpoints.map(async (endpoint) => {
        const start = Date.now();
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3004";
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(5000), // 5 second timeout
          });
          const time = Date.now() - start;
          return {
            endpoint,
            status: response.status,
            time,
            healthy: response.status < 500,
          };
        } catch (error) {
          const time = Date.now() - start;
          return {
            endpoint,
            status: 0,
            time,
            healthy: false,
          };
        }
      })
    );

    // Get response time for health endpoint
    const healthCheck = apiHealth.find((h) => h.endpoint === "/api/health");
    if (healthCheck) {
      metrics.responseTime = healthCheck.time;
    }

    return NextResponse.json({
      success: true,
      metrics,
      apiHealth,
    });
  } catch (error) {
    console.error("[monitoring] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch monitoring data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

