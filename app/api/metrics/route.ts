import { NextResponse } from "next/server";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Prometheus metrics endpoint
 * GET /api/metrics
 */
export async function GET() {
  try {
    const metrics: string[] = [];
    
    // Node.js process metrics
    const memUsage = process.memoryUsage();
    metrics.push(`# HELP nodejs_heap_size_total_bytes Total heap size in bytes`);
    metrics.push(`# TYPE nodejs_heap_size_total_bytes gauge`);
    metrics.push(`nodejs_heap_size_total_bytes ${memUsage.heapTotal}`);
    
    metrics.push(`# HELP nodejs_heap_size_used_bytes Used heap size in bytes`);
    metrics.push(`# TYPE nodejs_heap_size_used_bytes gauge`);
    metrics.push(`nodejs_heap_size_used_bytes ${memUsage.heapUsed}`);
    
    metrics.push(`# HELP nodejs_external_memory_bytes External memory in bytes`);
    metrics.push(`# TYPE nodejs_external_memory_bytes gauge`);
    metrics.push(`nodejs_external_memory_bytes ${memUsage.external}`);
    
    metrics.push(`# HELP nodejs_rss_bytes Resident Set Size in bytes`);
    metrics.push(`# TYPE nodejs_rss_bytes gauge`);
    metrics.push(`nodejs_rss_bytes ${memUsage.rss}`);
    
    // Process uptime
    metrics.push(`# HELP nodejs_process_uptime_seconds Process uptime in seconds`);
    metrics.push(`# TYPE nodejs_process_uptime_seconds gauge`);
    metrics.push(`nodejs_process_uptime_seconds ${process.uptime()}`);
    
    // CPU usage (simplified)
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    metrics.push(`# HELP nodejs_cpu_count Number of CPUs`);
    metrics.push(`# TYPE nodejs_cpu_count gauge`);
    metrics.push(`nodejs_cpu_count ${cpuCount}`);
    
    // System load
    const loadAvg = os.loadavg();
    metrics.push(`# HELP nodejs_system_load_1m System load average 1 minute`);
    metrics.push(`# TYPE nodejs_system_load_1m gauge`);
    metrics.push(`nodejs_system_load_1m ${loadAvg[0]}`);
    
    metrics.push(`# HELP nodejs_system_load_5m System load average 5 minutes`);
    metrics.push(`# TYPE nodejs_system_load_5m gauge`);
    metrics.push(`nodejs_system_load_5m ${loadAvg[1]}`);
    
    metrics.push(`# HELP nodejs_system_load_15m System load average 15 minutes`);
    metrics.push(`# TYPE nodejs_system_load_15m gauge`);
    metrics.push(`nodejs_system_load_15m ${loadAvg[2]}`);
    
    // System memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    metrics.push(`# HELP nodejs_system_memory_total_bytes Total system memory in bytes`);
    metrics.push(`# TYPE nodejs_system_memory_total_bytes gauge`);
    metrics.push(`nodejs_system_memory_total_bytes ${totalMem}`);
    
    metrics.push(`# HELP nodejs_system_memory_free_bytes Free system memory in bytes`);
    metrics.push(`# TYPE nodejs_system_memory_free_bytes gauge`);
    metrics.push(`nodejs_system_memory_free_bytes ${freeMem}`);
    
    // PM2 metrics (if available)
    try {
      const { stdout } = await execAsync("pm2 jlist 2>/dev/null || echo '[]'");
      const pm2List = JSON.parse(stdout.trim() || "[]");
      const app = pm2List.find((p: any) => p.name === "my-union-pro");
      
      if (app) {
        metrics.push(`# HELP pm2_app_restarts Total PM2 app restarts`);
        metrics.push(`# TYPE pm2_app_restarts counter`);
        metrics.push(`pm2_app_restarts{app="my-union-pro"} ${app.pm2_env?.restart_time || 0}`);
        
        metrics.push(`# HELP pm2_app_uptime_seconds PM2 app uptime in seconds`);
        metrics.push(`# TYPE pm2_app_uptime_seconds gauge`);
        const uptime = app.pm2_env?.pm_uptime 
          ? Math.floor((Date.now() - app.pm2_env.pm_uptime) / 1000) 
          : 0;
        metrics.push(`pm2_app_uptime_seconds{app="my-union-pro"} ${uptime}`);
        
        metrics.push(`# HELP pm2_app_memory_bytes PM2 app memory usage in bytes`);
        metrics.push(`# TYPE pm2_app_memory_bytes gauge`);
        metrics.push(`pm2_app_memory_bytes{app="my-union-pro"} ${app.monit?.memory || 0}`);
        
        metrics.push(`# HELP pm2_app_cpu_percent PM2 app CPU usage percent`);
        metrics.push(`# TYPE pm2_app_cpu_percent gauge`);
        metrics.push(`pm2_app_cpu_percent{app="my-union-pro"} ${app.monit?.cpu || 0}`);
        
        metrics.push(`# HELP pm2_app_status PM2 app status (1=online, 0=stopped)`);
        metrics.push(`# TYPE pm2_app_status gauge`);
        metrics.push(`pm2_app_status{app="my-union-pro"} ${app.pm2_env?.status === "online" ? 1 : 0}`);
      }
    } catch (pm2Error) {
      // PM2 metrics unavailable
    }
    
    // Application info
    metrics.push(`# HELP app_info Application information`);
    metrics.push(`# TYPE app_info gauge`);
    metrics.push(`app_info{version="${process.env.NEXT_PUBLIC_APP_VERSION || "unknown"}",node_version="${process.version}"} 1`);
    
    return new NextResponse(metrics.join("\n"), {
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[metrics] Error:", error);
    return new NextResponse("# Error generating metrics", {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
}

