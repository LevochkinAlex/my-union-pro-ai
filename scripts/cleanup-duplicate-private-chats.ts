#!/usr/bin/env tsx
/**
 * Безопасная очистка дублей личных чатов между одними и теми же пользователями.
 *
 * Что делает:
 * - Находит PRIVATE-чаты с ровно двумя активными участниками.
 * - Группирует по паре пользователей.
 * - В каждой группе оставляет самый свежий чат
 *   (по lastMessageAt, затем по createdAt).
 * - Для остальных дублей выполняет мягкую деактивацию:
 *   - ставит archivedAt у чата;
 *   - проставляет leftAt активным участникам.
 *
 * Данные (сообщения/файлы) НЕ удаляются.
 *
 * Запуск:
 * - Сухой прогон: DRY_RUN=1 dotenv -e .env.local -- pnpm exec tsx scripts/cleanup-duplicate-private-chats.ts
 * - Применить:     dotenv -e .env.local -- pnpm exec tsx scripts/cleanup-duplicate-private-chats.ts
 */

import { prisma } from "@/lib/prisma";

const DRY_RUN = process.env.DRY_RUN === "1";

type PairGroup = {
  key: string;
  userAId: string;
  userBId: string;
  chats: Array<{
    id: string;
    createdAt: Date;
    lastMessageAt: Date | null;
    participants: Array<{
      id: string;
      userId: string | null;
      leftAt: Date | null;
      user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
      } | null;
    }>;
  }>;
};

function pairKey(a: string, b: string): { key: string; a: string; b: string } {
  const [x, y] = a < b ? [a, b] : [b, a];
  return { key: `${x}::${y}`, a: x, b: y };
}

function rankTs(chat: { lastMessageAt: Date | null; createdAt: Date }): number {
  return chat.lastMessageAt?.getTime() ?? chat.createdAt.getTime();
}

function userName(u: { firstName: string | null; lastName: string | null; id: string } | null): string {
  if (!u) return "Удаленный пользователь";
  return [u.lastName, u.firstName].filter(Boolean).join(" ").trim() || u.id;
}

async function main() {
  console.log("🔍 Поиск дублей личных чатов (PRIVATE)...\n");
  if (DRY_RUN) {
    console.log("⚠️  Режим DRY_RUN: изменения не будут применены.\n");
  }

  const privateChats = await prisma.chat.findMany({
    where: { type: "PRIVATE" },
    select: {
      id: true,
      createdAt: true,
      lastMessageAt: true,
      participants: {
        where: { leftAt: null },
        select: {
          id: true,
          userId: true,
          leftAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  const groups = new Map<string, PairGroup>();

  for (const chat of privateChats) {
    // Только "чистые" личные чаты: ровно 2 активных участника с userId
    if (chat.participants.length !== 2) continue;
    const [p1, p2] = chat.participants;
    if (!p1.userId || !p2.userId) continue;
    if (p1.userId === p2.userId) continue;

    const { key, a, b } = pairKey(p1.userId, p2.userId);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, userAId: a, userBId: b, chats: [chat] });
    } else {
      existing.chats.push(chat);
    }
  }

  const duplicateGroups = Array.from(groups.values()).filter((g) => g.chats.length > 1);
  if (duplicateGroups.length === 0) {
    console.log("✅ Дубли личных чатов не найдены.\n");
    await prisma.$disconnect();
    return;
  }

  let totalToDeactivate = 0;
  for (const g of duplicateGroups) totalToDeactivate += g.chats.length - 1;

  console.log(`Найдено пар с дублями: ${duplicateGroups.length}`);
  console.log(`Чатов к деактивации: ${totalToDeactivate}\n`);

  // Короткий отчёт (до 20 групп)
  duplicateGroups.slice(0, 20).forEach((g, i) => {
    const sorted = [...g.chats].sort((c1, c2) => rankTs(c2) - rankTs(c1));
    const keep = sorted[0];
    const sampleP = keep.participants;
    const n1 = userName(sampleP[0]?.user ?? null);
    const n2 = userName(sampleP[1]?.user ?? null);
    console.log(
      `${i + 1}. ${n1} ↔ ${n2}: всего ${sorted.length}, оставить ${keep.id}, деактивировать ${sorted.length - 1}`
    );
  });
  if (duplicateGroups.length > 20) {
    console.log(`... и ещё ${duplicateGroups.length - 20} групп\n`);
  } else {
    console.log("");
  }

  if (DRY_RUN) {
    await prisma.$disconnect();
    return;
  }

  let deactivatedChats = 0;
  let deactivatedParticipants = 0;
  const now = new Date();

  for (const group of duplicateGroups) {
    const sorted = [...group.chats].sort((a, b) => rankTs(b) - rankTs(a));
    const toDeactivate = sorted.slice(1);
    if (toDeactivate.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      for (const chat of toDeactivate) {
        await tx.chat.update({
          where: { id: chat.id },
          data: { archivedAt: now },
        });
        const res = await tx.chatParticipant.updateMany({
          where: { chatId: chat.id, leftAt: null },
          data: { leftAt: now },
        });
        deactivatedParticipants += res.count;
        deactivatedChats += 1;
      }
    });
  }

  console.log("✅ Cleanup завершён:");
  console.log(`- Деактивировано чатов: ${deactivatedChats}`);
  console.log(`- Деактивировано participant-записей: ${deactivatedParticipants}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ Ошибка cleanup:", e);
  await prisma.$disconnect();
  process.exit(1);
});

