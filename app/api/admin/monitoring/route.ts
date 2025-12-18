import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

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

    // Get system metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuLoad = os.loadavg()[0]; // 1-minute load average
    const cpuCount = os.cpus().length;
    const cpuPercent = (cpuLoad / cpuCount) * 100;

    // Get PM2 metrics
    let pm2Data = {
      uptime: 0,
      restarts: 0,
      status: "online" as "online" | "offline" | "error",
      memory: 0,
    };

    try {
      const { stdout } = await execAsync("pm2 jlist 2>/dev/null || echo '[]'");
      const pm2List = JSON.parse(stdout.trim() || "[]");
      const app = pm2List.find((p: any) => p.name === "my-union-pro");
      
      if (app) {
        pm2Data = {
          uptime: app.pm2_env?.pm_uptime 
            ? Math.floor((Date.now() - app.pm2_env.pm_uptime) / 1000) 
            : 0,
          restarts: app.pm2_env?.restart_time || 0,
          status: app.pm2_env?.status === "online" ? "online" : "offline",
          memory: app.monit?.memory || 0,
        };
      }
    } catch (pm2Error) {
      console.warn("[monitoring] PM2 metrics unavailable:", pm2Error);
    }

    const metrics = {
      status: pm2Data.status,
      uptime: pm2Data.uptime,
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100,
        process: pm2Data.memory,
      },
      cpu: Math.min(cpuPercent, 100),
      restarts: pm2Data.restarts,
      responseTime: 0,
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
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

