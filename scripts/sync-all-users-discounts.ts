/**
 * Массовая синхронизация скидок всех пользователей с BestBenefits API
 *
 * Использует runSyncAllUsersDiscounts из lib/discount-sync-all-users.ts
 *
 * Использование:
 *   pnpm sync:all-users-discounts
 *
 * Cron: GET /api/cron/sync-user-discounts?secret=CRON_SECRET
 *
 * Первым импортом — load-env-local-first (cron на VDS без dotenv-cli).
 */

import "./load-env-local-first";
import { prisma } from "../lib/prisma";
import { runSyncAllUsersDiscounts } from "../lib/discount-sync-all-users";

async function main() {
  try {
    console.log("🔄 Массовая синхронизация скидок с BestBenefits...\n");

    const result = await runSyncAllUsersDiscounts({
      onProgress: (current, total, label, success) => {
        const progress = `[${current}/${total}]`;
        console.log(
          success
            ? `${progress} ✅ ${label}`
            : `${progress} ❌ ${label}`
        );
      },
    });

    console.log("\n" + "=".repeat(50));
    console.log("📊 Итог:");
    console.log(`   ✅ Успешно: ${result.successCount}`);
    console.log(`   ❌ Ошибок: ${result.errorCount}`);
    console.log(`   📥 Новых: ${result.totalSynced}`);
    console.log(`   🔄 Обновлено: ${result.totalUpdated}`);
    if (result.errors.length > 0) {
      console.log("\n   Ошибки:");
      result.errors.slice(0, 10).forEach((e) => console.log(`   • ${e}`));
    }
    console.log("=".repeat(50));
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Критическая ошибка:", error);
    process.exit(1);
  });
