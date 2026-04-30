/**
 * SLA заявок на площадки партнёров (напоминания + письмо о блокировке в каталоге).
 * Для VDS: добавлен в scripts/setup-cron.sh (каждые 15 мин, CRON_TZ=UTC).
 * Вручную: pnpm cron:partner-venue-sla
 */
import "./load-env-local-first";
import { runPartnerVenueApplicationSlaCronJob } from "../lib/partner-venue-application-sla-cron-job";

async function main() {
  console.log("[run-partner-venue-sla-cron] старт", new Date().toISOString());
  const started = Date.now();
  const result = await runPartnerVenueApplicationSlaCronJob();
  const duration = Date.now() - started;
  console.log(`[run-partner-venue-sla-cron] готово за ${duration}ms`, result);
  if (result.errors.length) {
    console.warn("[run-partner-venue-sla-cron] ошибки:", result.errors.slice(0, 20));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[run-partner-venue-sla-cron] критическая ошибка:", err);
  process.exit(1);
});
