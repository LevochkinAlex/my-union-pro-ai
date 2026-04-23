import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runPartnerLiquidationScan } from "@/lib/partner-liquidation-scan";

const CRON_SECRET = process.env.CRON_SECRET;

function validateCronRequest(request: NextRequest): boolean {
  if (request.headers.get("x-vercel-cron") === "true") return true;
  if (!CRON_SECRET) return false;
  if (request.headers.get("authorization") === `Bearer ${CRON_SECRET}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === CRON_SECRET) return true;
  return false;
}

/**
 * GET /api/cron/check-partner-liquidation
 * Ежедневная проверка ИНН/ОГРН партнёров в ЕГРЮЛ; при ликвидации — BLOCKED.
 * Авторизация: CRON_SECRET (Bearer или ?secret=), либо x-vercel-cron: true.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  if (!validateCronRequest(request)) {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    return NextResponse.json({ success: true, duration, ...result, errors: result.errors.slice(0, 20) });
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
    console.error("[cron/check-partner-liquidation]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
