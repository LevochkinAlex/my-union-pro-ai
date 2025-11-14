import { prisma } from "./prisma";
import type { LogLevel } from "@prisma/client";

export interface LogEntry {
  level: LogLevel;
  source: string;
  message: string;
  details?: Record<string, any>;
  stackTrace?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Centralized logging system for the application
 * Logs are stored in the database and can be monitored from the admin panel
 */
export class Logger {
  /**
   * Log an entry to the database
   */
  static async log(entry: LogEntry): Promise<void> {
    try {
      const log = await prisma.systemLog.create({
        data: {
          level: entry.level,
          source: entry.source,
          message: entry.message,
          details: entry.details,
          stackTrace: entry.stackTrace,
          userId: entry.userId,
          metadata: entry.metadata,
        },
      });

      // Console output for development
      if (process.env.NODE_ENV === "development") {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${entry.level}] [${entry.source}]`;
        console.log(`${prefix} ${entry.message}`, entry.details);
      }

      // Send notification for critical errors
      if (entry.level === "CRITICAL") {
        await this.notifySuperAdmins(log.id, entry);
      }

      return;
    } catch (error) {
      // Fallback to console if database logging fails
      console.error("[Logger] Failed to log to database:", error);
      console.error("[Logger] Original log entry:", entry);
    }
  }

  /**
   * Log info level
   */
  static async info(source: string, message: string, details?: Record<string, any>, userId?: string): Promise<void> {
    return this.log({
      level: "INFO",
      source,
      message,
      details,
      userId,
    });
  }

  /**
   * Log warning level
   */
  static async warning(source: string, message: string, details?: Record<string, any>, userId?: string): Promise<void> {
    return this.log({
      level: "WARNING",
      source,
      message,
      details,
      userId,
    });
  }

  /**
   * Log error level
   */
  static async error(
    source: string,
    message: string,
    error?: Error | string,
    details?: Record<string, any>,
    userId?: string
  ): Promise<void> {
    const stackTrace = error instanceof Error ? error.stack : undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return this.log({
      level: "ERROR",
      source,
      message,
      details: {
        ...details,
        error: errorMessage,
      },
      stackTrace,
      userId,
    });
  }

  /**
   * Log critical level (sends notification to admins)
   */
  static async critical(
    source: string,
    message: string,
    error?: Error | string,
    details?: Record<string, any>,
    userId?: string
  ): Promise<void> {
    const stackTrace = error instanceof Error ? error.stack : undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return this.log({
      level: "CRITICAL",
      source,
      message,
      details: {
        ...details,
        error: errorMessage,
      },
      stackTrace,
      userId,
    });
  }

  /**
   * Send notifications to super admins about critical errors
   */
  private static async notifySuperAdmins(logId: string, entry: LogEntry): Promise<void> {
    try {
      // Find all super admins
      const superAdmins = await prisma.user.findMany({
        where: { role: "SUPER_ADMIN" },
      });

      if (superAdmins.length === 0) return;

      // Mark notification as sent
      await prisma.systemLog.update({
        where: { id: logId },
        data: { notificationSent: true },
      });

      // Try to send push notification via OneSignal if configured
      if (process.env.ONESIGNAL_API_KEY) {
        const pushEndpoint = `${process.env.NEXTAUTH_URL || "http://localhost:3004"}/api/push/send`;
        
        for (const admin of superAdmins) {
          try {
            await fetch(pushEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Internal-Token": process.env.INTERNAL_API_TOKEN || "dev-token",
              },
              body: JSON.stringify({
                userId: admin.id,
                title: `⚠️ Critical Error: ${entry.source}`,
                message: entry.message.substring(0, 100),
                data: {
                  type: "system_error",
                  logId,
                  source: entry.source,
                },
              }),
            });
          } catch (err) {
            console.error("[Logger] Failed to send push notification:", err);
          }
        }
      }

      // Log the notification sending
      console.log(`[Logger] Critical error notification sent to ${superAdmins.length} admins`);
    } catch (error) {
      console.error("[Logger] Failed to notify super admins:", error);
    }
  }

  /**
   * Get recent logs for admin panel
   */
  static async getRecentLogs(
    limit: number = 50,
    level?: LogLevel,
    resolved?: boolean
  ): Promise<any[]> {
    try {
      return await prisma.systemLog.findMany({
        where: {
          ...(level && { level }),
          ...(resolved !== undefined && { resolved }),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          resolvedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch (error) {
      console.error("[Logger] Failed to get recent logs:", error);
      return [];
    }
  }

  /**
   * Get logs statistics
   */
  static async getLogsStats(): Promise<any> {
    try {
      const [total, errors, warnings, critical, unresolved] = await Promise.all([
        prisma.systemLog.count(),
        prisma.systemLog.count({ where: { level: "ERROR" } }),
        prisma.systemLog.count({ where: { level: "WARNING" } }),
        prisma.systemLog.count({ where: { level: "CRITICAL" } }),
        prisma.systemLog.count({ where: { resolved: false, level: { in: ["ERROR", "CRITICAL"] } } }),
      ]);

      return {
        total,
        errors,
        warnings,
        critical,
        unresolved,
      };
    } catch (error) {
      console.error("[Logger] Failed to get logs stats:", error);
      return { total: 0, errors: 0, warnings: 0, critical: 0, unresolved: 0 };
    }
  }

  /**
   * Resolve a log entry
   */
  static async resolveLog(logId: string, resolvedBy: string): Promise<void> {
    try {
      await prisma.systemLog.update({
        where: { id: logId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy,
        },
      });
    } catch (error) {
      console.error("[Logger] Failed to resolve log:", error);
    }
  }

  /**
   * Get logs by source for monitoring specific components
   */
  static async getLogsBySource(source: string, limit: number = 20): Promise<any[]> {
    try {
      return await prisma.systemLog.findMany({
        where: { source },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch (error) {
      console.error("[Logger] Failed to get logs by source:", error);
      return [];
    }
  }
}

// Helper function for Express-like middleware
export function createLoggerMiddleware() {
  return async (error: Error, source: string) => {
    await Logger.error(source, error.message, error);
  };
}

