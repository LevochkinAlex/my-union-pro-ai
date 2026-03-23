#!/usr/bin/env npx tsx
/**
 * Массовая установка пароля BestBenefits: новый пароль + create_user (myunion API).
 *
 * Для пользователей, которые УЖЕ есть в BB, create_user часто вернёт 422 «уже существует» —
 * тогда пароль на стороне BB НЕ меняется; email попадёт в отчёт tmp/bb-reset-all-skipped-*.json
 * (их нужно обработать через scripts/fix-bb-user-password.ts с кодом из письма).
 *
 * Запуск (обязательно подставить env: DATABASE_URL, BB_PROFSOYUZY_TOKEN):
 *
 *   pnpm dotenv -e .env.local -- tsx scripts/reset-all-bb-user-passwords.ts --dry-run
 *   pnpm dotenv -e .env.local -- tsx scripts/reset-all-bb-user-passwords.ts --execute
 *
 * Опции:
 *   --only-with-bb-id   только у кого уже есть bestBenefitsUserId (типичный случай «починить 401»)
 *   --delay-ms=600      пауза между запросами к BB (по умолчанию 700)
 */

import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { createBestBenefitsUser } from "../lib/best-benefits-users";
import { encryptPassword } from "../lib/best-benefits-password";
import { clearBestBenefitsUserTokenCache } from "../lib/best-benefits-user-auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const prisma = new PrismaClient();

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const execute = argv.includes("--execute");
  const onlyWithBbId = argv.includes("--only-with-bb-id");
  let delayMs = 700;
  const d = argv.find((a) => a.startsWith("--delay-ms="));
  if (d) delayMs = Math.max(200, parseInt(d.split("=")[1] || "700", 10) || 700);
  return { dryRun, execute, onlyWithBbId, delayMs };
}

function generateBbPassword(length = 14): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  const bytes = crypto.randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) s += charset[bytes[i] % charset.length];
  return s;
}

function isUserAlreadyExistsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  return (
    msg.includes("уже существует") ||
    msg.includes("422") ||
    msg.includes("Ошибка проверки") ||
    msg.includes("Ошибка валидации") ||
    low.includes("already exists") ||
    msg.includes("E-Mail адрес уже существует") ||
    msg.includes("email уже")
  );
}

async function main() {
  const { dryRun, execute, onlyWithBbId, delayMs } = parseArgs();

  if (!dryRun && !execute) {
    console.error("Укажите --dry-run или --execute");
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      emailVerified: { not: null },
      firstName: { not: null },
      lastName: { not: null },
      ...(onlyWithBbId ? { bestBenefitsUserId: { not: null } } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      bestBenefitsUserId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `\n📋 Пользователей к обработке: ${users.length}` +
      (onlyWithBbId ? " (только с bestBenefitsUserId)" : "") +
      "\n",
  );

  if (users.length === 0) {
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    users.slice(0, 15).forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.email}  bbId=${u.bestBenefitsUserId ?? "—"}`);
    });
    if (users.length > 15) console.log(`  ... и ещё ${users.length - 15}`);
    console.log("\n✅ Dry-run. Для запуска: --execute\n");
    await prisma.$disconnect();
    return;
  }

  const skipped: { email: string; reason: string }[] = [];
  const failed: { email: string; error: string }[] = [];
  let ok = 0;

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const email = u.email!;
    const label = `[${i + 1}/${users.length}] ${email}`;

    const name =
      [u.firstName, u.lastName].filter(Boolean).join(" ") || email.split("@")[0];
    const password = generateBbPassword(14);

    try {
      const result = await createBestBenefitsUser({
        name,
        email,
        password,
        city_id: null,
      });

      const bbUserId = result.data?.id?.toString() || email;

      await prisma.user.update({
        where: { id: u.id },
        data: {
          bestBenefitsUserId: bbUserId,
          bestBenefitsStatus: result.data?.status || result.status || "success",
          bestBenefitsCreatedAt: new Date(),
          bestBenefitsPassword: encryptPassword(password),
        },
      });

      clearBestBenefitsUserTokenCache(email);
      if (u.bestBenefitsUserId && u.bestBenefitsUserId !== email) {
        clearBestBenefitsUserTokenCache(u.bestBenefitsUserId);
      }

      console.log(`${label} ✅ BB ok, пароль обновлён в БД`);
      ok++;
    } catch (e) {
      if (isUserAlreadyExistsError(e)) {
        console.warn(
          `${label} ⚠️ уже есть в BB — пароль через API не сменён; нужен fix-bb-user-password или код с почты`,
        );
        skipped.push({ email, reason: "already_exists_in_bb" });
      } else {
        const err = e instanceof Error ? e.message : String(e);
        console.error(`${label} ❌ ${err}`);
        failed.push({ email, error: err });
      }
    }

    if (i < users.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const reportDir = path.join(root, "tmp");
  try {
    fs.mkdirSync(reportDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (skipped.length) {
    const p = path.join(reportDir, `bb-reset-all-skipped-${stamp}.json`);
    fs.writeFileSync(p, JSON.stringify(skipped, null, 2), "utf8");
    console.log(`\n📄 Уже были в BB (ручная доработка): ${skipped.length} → ${p}`);
  }
  if (failed.length) {
    const p = path.join(reportDir, `bb-reset-all-failed-${stamp}.json`);
    fs.writeFileSync(p, JSON.stringify(failed, null, 2), "utf8");
    console.log(`\n📄 Ошибки: ${failed.length} → ${p}`);
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Успешно (create_user + пароль в БД): ${ok}`);
  console.log(`⚠️ Пропущено (уже в BB): ${skipped.length}`);
  console.log(`❌ Ошибки API/сети: ${failed.length}`);
  console.log("=".repeat(50) + "\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
