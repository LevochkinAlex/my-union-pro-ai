/**
 * Одноразовая синхронизация пользователя с BestBenefits по email.
 *
 * Важно: сначала dotenv, затем dynamic import — иначе lib/best-benefits-users
 * и пароль шифрования читают пустой process.env при первом импорте.
 *
 * Usage:
 *   pnpm tsx scripts/sync-one-user-to-bb.ts bsm_za@mail.ru
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

const emailArg = process.argv[2]?.trim();
if (!emailArg) {
  console.error("Usage: pnpm tsx scripts/sync-one-user-to-bb.ts <email>");
  process.exit(1);
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const crypto = await import("crypto");
  const { syncUserToBestBenefits } = await import("../lib/best-benefits-users");
  const { encryptPassword } = await import("../lib/best-benefits-password");

  const prisma = new PrismaClient();

  const hasToken = Boolean(
    process.env.BB_PROFSOYUZY_TOKEN?.trim() || process.env.BB_API_TOKEN?.trim(),
  );
  if (!hasToken) {
    console.error("❌ В окружении нет BB_PROFSOYUZY_TOKEN / BB_API_TOKEN после загрузки .env");
    process.exit(1);
  }
  console.log(`[env] BB org token: ${hasToken ? "задан" : "нет"}`);

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: emailArg, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user?.email) {
      console.error(`❌ Пользователь не найден: ${emailArg}`);
      process.exit(1);
    }

    console.log(`Пользователь: ${user.id} ${user.email}`);
    console.log(`ФИО: ${user.lastName ?? "—"} ${user.firstName ?? "—"}`);
    console.log(`emailVerified: ${user.emailVerified ? "да" : "нет"}`);
    console.log(`bestBenefitsUserId: ${user.bestBenefitsUserId ?? "нет"}`);

    if (!user.emailVerified) {
      console.error("❌ Сначала подтвердите email.");
      process.exit(1);
    }
    if (!user.firstName?.trim() || !user.lastName?.trim()) {
      console.error("❌ Нужны имя и фамилия в профиле.");
      process.exit(1);
    }
    if (user.bestBenefitsUserId) {
      console.log("✅ Уже есть bestBenefitsUserId, выход.");
      return;
    }

    if (process.env.USE_REAL_BB_API !== "true") {
      console.warn("⚠️ USE_REAL_BB_API не true");
    }

    const bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
    console.log("Создание в BestBenefits через API...");

    const bbData = await syncUserToBestBenefits({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: bbPassword,
      city_id: null,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        bestBenefitsUserId: bbData.bestBenefitsUserId,
        bestBenefitsStatus: bbData.status,
        bestBenefitsCreatedAt: new Date(),
        bestBenefitsPassword: encryptPassword(bbPassword),
      },
    });

    console.log("✅ Готово:");
    console.log(`   bestBenefitsUserId: ${bbData.bestBenefitsUserId}`);
    console.log(`   status: ${bbData.status}`);
    console.log("   Пароль BB сохранён в БД (зашифрован).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("❌", e);
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("401") || msg.includes("Unauthorized")) {
    console.error(
      "\n→ BestBenefits вернул 401: орг-токен в .env отклонён (истёк или не для API myunion/create_user).\n" +
        "  Возьмите актуальный токен у BestBenefits для интеграции МойСоюз, обновите BB_PROFSOYUZY_TOKEN на сервере (.env / окружение), затем снова:\n" +
        "  pnpm tsx scripts/sync-one-user-to-bb.ts <email>",
    );
  }
  process.exit(1);
});
