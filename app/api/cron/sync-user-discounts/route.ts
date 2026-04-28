import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSyncAllUsersDiscounts } from "@/lib/discount-sync-all-users";

const CRON_SECRET = process.env.CRON_SECRET;

function validateCronRequest(request: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  if (request.headers.get("authorization") === `Bearer ${CRON_SECRET}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === CRON_SECRET;
}

/**
 * GET /api/cron/sync-user-discounts
 * Синхронизация активированных скидок всех пользователей с BestBenefits
 * Вызывается cron после sync-discounts (каталог)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  if (!validateCronRequest(request)) {
    if (!CRON_SECRET) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron] Starting sync-user-discounts...");

  try {
    const result = await runSyncAllUsersDiscounts();

    const duration = Date.now() - startTime;
    const status =
      result.errorCount === 0
        ? "SUCCESS"
        : result.successCount > 0
          ? "PARTIAL"
          : "FAILED";

    await prisma.syncLog.create({
      data: {
        type: "USER_DISCOUNTS",
        source: "CRON",
        status,
        itemsCreated: result.totalSynced,
        itemsUpdated: result.totalUpdated,
        itemsFailed: result.errorCount,
        duration,
        errors: result.errors.length > 0 ? result.errors.slice(0, 50) : undefined,
        metadata: {
          usersProcessed: result.usersProcessed,
          successCount: result.successCount,
        },
      },
    });

    console.log(
      `[cron] sync-user-discounts completed: ${result.successCount} ok, ${result.errorCount} errors`
    );

    return NextResponse.json({
      success: true,
      ...result,
      errors: result.errors.slice(0, 20),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    await prisma.syncLog.create({
      data: {
        type: "USER_DISCOUNTS",
        source: "CRON",
        status: "FAILED",
        duration,
        errors: [error instanceof Error ? error.message : String(error)],
      },
    }).catch(() => {});

    console.error("[cron] sync-user-discounts failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
