/**
 * Ревизия аккаунтов по номеру телефона.
 * Запуск: npx ts-node scripts/audit-phone-accounts.ts [номер]
 * Пример: npx ts-node scripts/audit-phone-accounts.ts +79032911816
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("8")) cleaned = "+7" + cleaned.slice(1);
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) cleaned = "+" + cleaned;
  return cleaned;
}

function phoneVariants(phone: string): string[] {
  const n = normalizePhone(phone);
  const digits = n.replace(/\D/g, "");
  return [
    n,
    digits,
    "7" + digits.slice(1),
    "8" + digits.slice(1),
  ].filter(Boolean);
}

async function main() {
  const input = process.argv[2] || "+79032911816";
  const variants = phoneVariants(input);
  console.log("Поиск аккаунтов по номеру:", input, "\nВарианты:", variants.join(", "));

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { phone: { in: variants } },
        { authPhone: { in: variants } },
      ],
    },
    include: {
      organization: { select: { id: true, name: true } },
      _count: {
        select: {
          documents: true,
          tickets: true,
          staffPositions: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n=== Найдено пользователей:", users.length, "===\n");
  if (users.length === 0) {
    const byHistory = await prisma.phoneHistory.findMany({
      where: {
        OR: variants.map((p) => ({ phone: p })),
      },
      include: { user: { select: { id: true, phone: true, authPhone: true, email: true, firstName: true, lastName: true, createdAt: true } } },
      take: 20,
    });
    if (byHistory.length > 0) {
      console.log("В истории телефонов найдены записи:");
      byHistory.forEach((h) => {
        console.log("  phone:", h.phone, "userId:", h.userId, "user:", h.user?.firstName, h.user?.lastName, h.user?.email, h.user?.phone);
      });
    }
    return;
  }

  for (const u of users) {
    console.log("---");
    console.log("ID:", u.id);
    console.log("ФИО:", [u.lastName, u.firstName, u.middleName].filter(Boolean).join(" "));
    console.log("Email:", u.email ?? "—");
    console.log("Phone:", u.phone ?? "—");
    console.log("AuthPhone:", u.authPhone ?? "—");
    console.log("Роль:", u.role, "| Статус:", u.membershipStatus);
    console.log("Организация:", u.organization?.name ?? u.organizationName ?? "—");
    console.log("Создан:", u.createdAt.toISOString());
    console.log("Документов:", u._count.documents, "| Обращений:", u._count.tickets, "| Сотрудник орг:", u._count.staffPositions);
    console.log("");
  }

  if (users.length > 1) {
    console.log("⚠️ Обнаружено несколько аккаунтов по одному номеру. Рекомендуется объединить через админку (Merge аккаунтов).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
