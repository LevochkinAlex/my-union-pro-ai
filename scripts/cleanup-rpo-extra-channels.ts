#!/usr/bin/env tsx
/**
 * Удаляет лишние каналы, привязанные к региональной организации (RPO),
 * оставляя у РПО только глобальный канал "Региональные новости".
 *
 * Безопасность:
 * - Перед удалением переносит все посты в глобальный региональный канал.
 * - При DRY_RUN только показывает, что будет изменено.
 *
 * Запуск:
 *   DRY_RUN=1 pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/cleanup-rpo-extra-channels.ts
 *   pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/cleanup-rpo-extra-channels.ts
 */

import { prisma } from "@/lib/prisma";
import { getOrCreateRegionalNewsChannel, REGIONAL_NEWS_CHANNEL_NAME } from "@/lib/regional-news";

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log("🔍 Поиск лишних каналов у РПО...\n");
  if (DRY_RUN) {
    console.log("⚠️ DRY_RUN: изменения не применяются.\n");
  }

  const regionalOrgs = await prisma.organization.findMany({
    where: { type: "REGIONAL" },
    select: { id: true, name: true, rpoChairman: { select: { id: true } } },
  });

  if (regionalOrgs.length === 0) {
    console.log("Региональные организации не найдены.");
    return;
  }

  for (const org of regionalOrgs) {
    const createdById = org.rpoChairman?.id;
    if (!createdById) {
      console.log(`- ${org.name}: пропуск (нет rpoChairman)`);
      continue;
    }

    const regionalChannel = await getOrCreateRegionalNewsChannel(createdById);

    const extraChannels = await prisma.newsChannel.findMany({
      where: {
        organizationId: org.id,
        // У РПО не должно быть собственных org-каналов.
        // Берём только обычные (не глобальные) каналы.
        globalScopeKey: null,
      },
      select: {
        id: true,
        name: true,
        _count: { select: { newsPosts: true } },
        chat: { select: { id: true } },
      },
    });

    if (extraChannels.length === 0) {
      console.log(`- ${org.name}: лишних каналов нет`);
      continue;
    }

    const extraIds = extraChannels.map((c) => c.id);
    const postCount = extraChannels.reduce((sum, c) => sum + (c._count?.newsPosts || 0), 0);
    const chatIds = extraChannels.map((c) => c.chat?.id).filter((id): id is string => Boolean(id));

    console.log(`- ${org.name}: найдено лишних каналов ${extraChannels.length}`);
    extraChannels.forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.name} (${c.id}) posts=${c._count?.newsPosts || 0}${c.chat?.id ? ` chat=${c.chat.id}` : ""}`);
    });

    if (DRY_RUN) {
      console.log("");
      continue;
    }

    // 1) Переносим посты в глобальный региональный канал
    if (postCount > 0) {
      await prisma.newsPost.updateMany({
        where: { channelId: { in: extraIds } },
        data: { channelId: regionalChannel.id },
      });
    }

    // 2) Удаляем channel-чаты, связанные с лишними каналами
    if (chatIds.length > 0) {
      await prisma.chat.deleteMany({
        where: { id: { in: chatIds } },
      });
    }

    // 3) Удаляем лишние каналы
    await prisma.newsChannel.deleteMany({
      where: { id: { in: extraIds } },
    });

    console.log(`  ✅ Удалено каналов: ${extraChannels.length}, перенесено постов: ${postCount}, удалено чатов: ${chatIds.length}\n`);
  }
}

main()
  .catch((e) => {
    console.error("❌ cleanup-rpo-extra-channels error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

