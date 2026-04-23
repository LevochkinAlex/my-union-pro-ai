import { prisma } from "@/lib/prisma";
import {
  runPartnerLiquidationScan,
  type PartnerLiquidationScanResult,
} from "@/lib/partner-liquidation-scan";

/**
 * Одна «порция» работы крона ЕГРЮЛ: скан + запись в SyncLog.
 * Используется и HTTP GET /api/cron/check-partner-liquidation, и VDS-скрипт `scripts/run-partner-liquidation-cron.ts`.
 * На VDS расписание: ежедневно **02:00 UTC** (`CRON_TZ=UTC`, `0 2 * * *` в `scripts/setup-cron.sh`).
 */
export async function runPartnerLiquidationCronJob(): Promise<{
  result: PartnerLiquidationScanResult;
  duration: number;
}> {
  const startTime = Date.now();
  try {
    const result = await runPartnerLiquidationScan({ triggeredBy: "CRON" });
    const duration = Date.now() - startTime;
    const status =
      result.errors.length === 0
        ? "SUCCESS"
        : result.processed > 0 || result.blocked > 0
          ? "PARTIAL"
          : "FAILED";

    await prisma.syncLog
      .create({
        data: {
          type: "PARTNER_LIQUIDATION_EGRUL",
          source: "CRON",
          status,
          itemsCreated: 0,
          itemsUpdated: result.updatedStatusOnly,
          itemsFailed: result.errors.length,
          duration,
          errors: result.errors.length > 0 ? result.errors.slice(0, 50) : undefined,
          metadata: {
            processed: result.processed,
            blocked: result.blocked,
            captchaHits: result.captchaHits,
          },
        },
      })
      .catch(() => {});

    return { result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    await prisma.syncLog
      .create({
        data: {
          type: "PARTNER_LIQUIDATION_EGRUL",
          source: "CRON",
          status: "FAILED",
          duration,
          errors: [error instanceof Error ? error.message : String(error)],
        },
      })
      .catch(() => {});
    throw error;
  }
}
