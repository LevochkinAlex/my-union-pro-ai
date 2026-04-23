import { NextRequest, NextResponse } from "next/server";
import { runPartnerLiquidationCronJob } from "@/lib/partner-liquidation-cron-job";

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
 *
 * На VDS предпочтительно: `scripts/run-partner-liquidation-cron.ts` из crontab (без HTTP).
 */
export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { result, duration } = await runPartnerLiquidationCronJob();
    return NextResponse.json({ success: true, duration, ...result, errors: result.errors.slice(0, 20) });
  } catch (error) {
    console.error("[cron/check-partner-liquidation]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
