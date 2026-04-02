import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runSyncAllUsersDiscounts } from "@/lib/discount-sync-all-users";

export const maxDuration = 300;

/**
 * POST /api/admin/sync-all-users-discounts
 * Массовая синхронизация активированных скидок всех пользователей с BestBenefits
 * (по пользователям с bestBenefitsUserId). Только SUPER_ADMIN.
 */
export async function POST(): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const result = await runSyncAllUsersDiscounts();
    const duration = Date.now() - startTime;

    const status =
      result.errorCount === 0
        ? "SUCCESS"
        : result.successCount > 0
          ? "PARTIAL"
          : "FAILED";

    await prisma.syncLog
      .create({
        data: {
          type: "USER_DISCOUNTS",
          source: "MANUAL",
          status,
          itemsCreated: result.totalSynced,
          itemsUpdated: result.totalUpdated,
          itemsFailed: result.errorCount,
          duration,
          errors: result.errors.length > 0 ? result.errors.slice(0, 100) : undefined,
          metadata: {
            usersProcessed: result.usersProcessed,
            successCount: result.successCount,
          },
        },
      })
      .catch((e) => console.error("[admin/sync-all-users-discounts] sync log:", e));

    return NextResponse.json({
      success: true,
      duration,
      successCount: result.successCount,
      errorCount: result.errorCount,
      totalSynced: result.totalSynced,
      totalUpdated: result.totalUpdated,
      usersProcessed: result.usersProcessed,
      errors: result.errors.slice(0, 50),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    await prisma.syncLog
      .create({
        data: {
          type: "USER_DISCOUNTS",
          source: "MANUAL",
          status: "FAILED",
          duration,
          errors: [error instanceof Error ? error.message : String(error)],
        },
      })
      .catch(() => {});

    console.error("[admin/sync-all-users-discounts]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      },
      { status: 500 }
    );
  }
}
