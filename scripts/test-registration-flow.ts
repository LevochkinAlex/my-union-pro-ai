/**
 * Смоук-тест полного цикла регистрации:
 * POST /api/auth/register/submit → GET confirm → редирект на /auth/email/success?token=
 * + проверка в БД: пользователь создан, membershipStatus PROFILE_INCOMPLETE (анкета ожидается в UI).
 *
 * Запуск: dotenv -e .env.local -- npx tsx scripts/test-registration-flow.ts
 * Требуется: работающий next dev (pnpm dev) на TEST_BASE_URL (по умолчанию http://localhost:3004).
 */

import { PrismaClient } from "@prisma/client";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3004";

async function main() {
  const prisma = new PrismaClient();
  try {
    const n = Date.now();
    const rnd = Math.floor(Math.random() * 1_000_000);
    const email = `regtest+${n}${rnd}@example.test`;
    const phone = `+7911${String((n + rnd) % 10_000_000).padStart(7, "0")}`;

    console.log("[test-registration-flow] BASE:", BASE);
    console.log("[test-registration-flow] Тестовый email:", email, "phone:", phone);

    const submitRes = await fetch(`${BASE}/api/auth/register/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lastName: "Тестов",
      firstName: "Регистр",
      middleName: "Поток",
      phone,
      email,
      telegramUsername: undefined,
    }),
    });

    const submitJson = (await submitRes.json()) as {
    success?: boolean;
    error?: string;
    confirmLink?: string;
    devMode?: boolean;
    };

    if (!submitRes.ok || !submitJson.success) {
      console.error("[test-registration-flow] submit failed:", submitRes.status, submitJson);
      process.exit(1);
    }

    const confirmLink = submitJson.confirmLink;
    if (!confirmLink) {
      console.error("[test-registration-flow] Нет confirmLink в ответе (нужен devMode / SMTP или проверьте ответ API).");
      process.exit(1);
    }

    console.log("[test-registration-flow] confirmLink получен (dev):", confirmLink.slice(0, 80) + "...");

    const confirmRes = await fetch(confirmLink, { redirect: "manual" });
    const loc = confirmRes.headers.get("location");
    console.log("[test-registration-flow] GET confirm status:", confirmRes.status, "Location:", loc?.slice(0, 100));

    if (confirmRes.status !== 302 && confirmRes.status !== 307) {
      console.error("[test-registration-flow] Ожидался редирект 302/307");
      process.exit(1);
    }

    if (!loc || !loc.includes("/auth/email/success?token=")) {
      console.error("[test-registration-flow] Неверный Location:", loc);
      process.exit(1);
    }

    const token = new URL(loc, BASE).searchParams.get("token");
    if (!token) {
      console.error("[test-registration-flow] Нет token в Location");
      process.exit(1);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, membershipStatus: true, emailVerified: true, firstName: true, lastName: true },
    });

    if (!user) {
      console.error("[test-registration-flow] Пользователь не найден в БД после confirm");
      process.exit(1);
    }

    if (user.membershipStatus !== "PROFILE_INCOMPLETE") {
      console.error("[test-registration-flow] Ожидался PROFILE_INCOMPLETE, получено:", user.membershipStatus);
      await cleanup(prisma, user.id);
      process.exit(1);
    }

    if (!user.emailVerified) {
      console.error("[test-registration-flow] emailVerified должен быть установлен");
      await cleanup(prisma, user.id);
      process.exit(1);
    }

    const loginTok = await prisma.loginToken.findFirst({
      where: { userId: user.id },
      orderBy: { expiresAt: "desc" },
    });
    if (!loginTok || loginTok.token !== token) {
      console.error("[test-registration-flow] LoginToken не совпадает с редиректом");
      await cleanup(prisma, user.id);
      process.exit(1);
    }

    console.log("[test-registration-flow] OK: пользователь создан, статус PROFILE_INCOMPLETE, токен входа совпадает.");
    console.log("[test-registration-flow] UI: после входа по токену (страница /auth/email/success) откроется /dashboard;");
    console.log("[test-registration-flow] анкета: баннер «Заполнить анкету» → кнопка открывает QuestionnaireModal (не авто по URL без ?openQuestionnaire=true).");

    await cleanup(prisma, user.id);
    console.log("[test-registration-flow] Тестовый пользователь удалён из БД.");
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanup(prisma: PrismaClient, userId: string) {
  await prisma.loginToken.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
