#!/usr/bin/env tsx
/**
 * Удаление личных чатов между пользователями из разных ППО («мёртвые души»).
 * После введения закрытого круга чатов внутри одного ППО такие чаты больше не должны существовать.
 *
 * Запуск: pnpm exec tsx scripts/cleanup-cross-ppo-private-chats.ts
 * Сухой прогон (без удаления): DRY_RUN=1 pnpm exec tsx scripts/cleanup-cross-ppo-private-chats.ts
 */

import { prisma } from "@/lib/prisma";

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log("🔍 Поиск личных чатов между пользователями из разных ППО...\n");
  if (DRY_RUN) {
    console.log("⚠️  Режим DRY_RUN: удаление не выполняется.\n");
  }

  const privateChats = await prisma.chat.findMany({
    where: { type: "PRIVATE" },
    select: {
      id: true,
      createdAt: true,
      participants: {
        where: { leftAt: null },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              organizationId: true,
              organization: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const toDelete: Array<{
    id: string;
    createdAt: Date;
    user1: { id: string; name: string; orgId: string | null; orgName: string | null };
    user2: { id: string; name: string; orgId: string | null; orgName: string | null };
  }> = [];

  for (const chat of privateChats) {
    const participants = chat.participants.filter((p) => p.user != null) as Array<{
      userId: string;
      user: { id: string; firstName: string | null; lastName: string | null; organizationId: string | null; organization: { name: string } | null };
    }>;
    if (participants.length !== 2) continue;

    const [a, b] = participants;
    const orgId1 = a.user.organizationId ?? null;
    const orgId2 = b.user.organizationId ?? null;
    if (orgId1 === orgId2) continue;

    const name = (u: typeof a.user) =>
      [u.lastName, u.firstName].filter(Boolean).join(" ") || u.id;
    toDelete.push({
      id: chat.id,
      createdAt: chat.createdAt,
      user1: {
        id: a.user.id,
        name: name(a.user),
        orgId: orgId1,
        orgName: a.user.organization?.name ?? null,
      },
      user2: {
        id: b.user.id,
        name: name(b.user),
        orgId: orgId2,
        orgName: b.user.organization?.name ?? null,
      },
    });
  }

  if (toDelete.length === 0) {
    console.log("✅ Личных чатов между разными ППО не найдено.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`Найдено чатов между разными ППО: ${toDelete.length}\n`);
  toDelete.forEach((c, i) => {
    console.log(
      `  ${i + 1}. Чат ${c.id}: ${c.user1.name} (${c.user1.orgName ?? "без ППО"}) ↔ ${c.user2.name} (${c.user2.orgName ?? "без ППО"})`
    );
  });
  console.log("");

  if (!DRY_RUN) {
    const ids = toDelete.map((c) => c.id);
    const deleted = await prisma.chat.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`🗑️  Удалено чатов: ${deleted.count}\n`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
