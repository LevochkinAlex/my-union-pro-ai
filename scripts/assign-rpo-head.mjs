#!/usr/bin/env node
/**
 * Назначает пользователя mail@mooprz.ru председателем региональной организации (РПО)
 * и даёт доступ к кабинету РПО.
 * Если пользователя нет — создаёт его.
 *
 * Использование: dotenv -e .env.local -- node scripts/assign-rpo-head.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_EMAIL = "mail@mooprz.ru";
const RPO_ORG_NAME = "Московская областная организация профсоюза работников здравоохранения РФ";

async function main() {
  console.log("[assign-rpo-head] Ищем пользователя:", TARGET_EMAIL);

  let user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isRPOHead: true,
      rpoHeadOrganizationId: true,
      viewMode: true,
    },
  });

  if (!user) {
    console.log("[assign-rpo-head] Пользователь не найден, создаём...");
    user = await prisma.user.create({
      data: {
        email: TARGET_EMAIL,
        role: "PENDING_MEMBER",
        membershipStatus: "APPROVED",
        firstName: "Председатель",
        lastName: "РПО",
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        middleName: true,
        isRPOHead: true,
        rpoHeadOrganizationId: true,
        viewMode: true,
      },
    });
    console.log("[assign-rpo-head] Создан пользователь:", user.id);
  } else {
    console.log("[assign-rpo-head] Найден пользователь:", user.id, user.firstName, user.lastName);
  }

  const org = await prisma.organization.findFirst({
    where: {
      type: "REGIONAL",
      name: RPO_ORG_NAME,
    },
    select: { id: true, name: true },
  });

  if (!org) {
    console.error("[assign-rpo-head] ❌ Региональная организация не найдена:", RPO_ORG_NAME);
    const anyRegional = await prisma.organization.findMany({
      where: { type: "REGIONAL" },
      select: { id: true, name: true },
    });
    console.log("[assign-rpo-head] Доступные РПО:", anyRegional);
    process.exit(1);
  }

  console.log("[assign-rpo-head] Найдена РПО:", org.id, org.name);

  // Снимаем предыдущего председателя РПО (если есть)
  const previousRpoHead = await prisma.user.findFirst({
    where: { rpoHeadOrganizationId: org.id, id: { not: user.id } },
    select: { id: true, email: true },
  });

  if (previousRpoHead) {
    console.log("[assign-rpo-head] Снимаем предыдущего председателя:", previousRpoHead.email);
    await prisma.user.update({
      where: { id: previousRpoHead.id },
      data: {
        isRPOHead: false,
        rpoHeadOrganizationId: null,
        viewMode: "MEMBER",
      },
    });
  }

  // Назначаем нового председателя
  const chairmanName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        isRPOHead: true,
        rpoHeadOrganizationId: org.id,
        viewMode: "RPO_HEAD",
        membershipStatus: "APPROVED",
      },
    }),
    prisma.organization.update({
      where: { id: org.id },
      data: {
        chairmanName: chairmanName || null,
      },
    }),
  ]);

  console.log("[assign-rpo-head] ✅ Пользователь", TARGET_EMAIL, "назначен председателем РПО:", org.name);
  console.log("[assign-rpo-head] Доступ к кабинету РПО: https://myunion.pro/dashboard (режим «Председатель РПО»)");
  console.log("[assign-rpo-head] Для входа нужна регистрация/восстановление пароля по email или SMS.");
}

main()
  .catch((e) => {
    console.error("[assign-rpo-head] Ошибка:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
