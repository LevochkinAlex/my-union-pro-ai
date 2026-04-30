import { NextRequest, NextResponse } from "next/server";
import { runPartnerVenueApplicationSlaCronJob } from "@/lib/partner-venue-application-sla-cron-job";

const CRON_SECRET = process.env.CRON_SECRET;

function authorizeCron(request: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  if (request.headers.get("authorization") === `Bearer ${CRON_SECRET}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === CRON_SECRET;
}

/**
 * GET /api/cron/partner-venue-application-sla
 * Напоминания партнёру по заявкам NEW (24 ч, 2 ч до конца 48 ч), письмо о скрытии площадки.
 * Авторизация: CRON_SECRET (заголовок Authorization: Bearer или ?secret=).
 */
export async function GET(request: NextRequest) {
  if (!CRON_SECRET) {
    console.error("[cron/partner-venue-application-sla] CRON_SECRET not configured");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await runPartnerVenueApplicationSlaCronJob();
    const duration = Date.now() - started;
    console.log("[cron/partner-venue-application-sla] done", { durationMs: duration, ...result });
    return NextResponse.json({ ok: true, durationMs: duration, ...result });
  } catch (e) {
    console.error("[cron/partner-venue-application-sla]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cron failed" },
      { status: 500 }
    );
  }
}
