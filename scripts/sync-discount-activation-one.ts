/**
 * Синхронизация DiscountActivation + промокодов для одного email (lib/discount-activation).
 *
 *   pnpm tsx scripts/sync-discount-activation-one.ts bsm_za@mail.ru
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const email = process.argv[2]?.trim();
if (!email) {
  console.error("Usage: pnpm tsx scripts/sync-discount-activation-one.ts <email>");
  process.exit(1);
}

async function run() {
  const { prisma } = await import("../lib/prisma");
  const { syncDiscountsWithBestBenefits } = await import("../lib/discount-activation");
  const { decryptPassword } = await import("../lib/best-benefits-password");

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      bestBenefitsUserId: true,
      bestBenefitsPassword: true,
    },
  });

  if (!user?.bestBenefitsUserId) {
    console.error("Нет bestBenefitsUserId — сначала sync-one-user-to-bb.ts");
    process.exit(1);
  }

  let pwd: string | undefined;
  if (user.bestBenefitsPassword) {
    try {
      pwd = decryptPassword(user.bestBenefitsPassword);
    } catch (e) {
      console.error("Не удалось расшифровать bestBenefitsPassword:", e);
      process.exit(1);
    }
  }

  const result = await syncDiscountsWithBestBenefits(
    user.id,
    user.bestBenefitsUserId,
    pwd,
  );

  console.log("Результат syncDiscountsWithBestBenefits:", result);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
