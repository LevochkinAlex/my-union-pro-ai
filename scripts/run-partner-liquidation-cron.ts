/**
 * Ежедневная проверка партнёров в ЕГРЮЛ (без HTTP): для crontab на VDS.
 *
 * Запуск на сервере (после setup-cron.sh): по расписанию из root crontab.
 * Вручную: pnpm cron:partner-liquidation
 *
 * Требует DATABASE_URL и остальные переменные как у приложения (.env.local на проде).
 * Первым импортом — load-env-local-first (cron вызывает tsx без dotenv-cli).
 */

import "./load-env-local-first";
import { runPartnerLiquidationCronJob } from "../lib/partner-liquidation-cron-job";
import { prisma } from "../lib/prisma";

async function main() {
  try {
    console.log("[run-partner-liquidation-cron] старт", new Date().toISOString());
    const { result, duration } = await runPartnerLiquidationCronJob();
    console.log(
      `[run-partner-liquidation-cron] готово за ${duration}ms: processed=${result.processed} blocked=${result.blocked} updates=${result.updatedStatusOnly} errors=${result.errors.length} captcha=${result.captchaHits}`
    );
    if (result.errors.length > 0) {
      console.log("[run-partner-liquidation-cron] первые ошибки:");
      result.errors.slice(0, 5).forEach((e) => console.log("  •", e));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[run-partner-liquidation-cron] критическая ошибка:", err);
    process.exit(1);
  });
