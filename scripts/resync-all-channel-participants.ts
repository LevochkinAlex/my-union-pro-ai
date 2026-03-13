/**
 * Массовая досинхронизация участников каналов (NewsChannel -> ChatParticipant)
 *
 * Что делает:
 * - для каждого NewsChannel вызывает syncChannelWithChat()
 * - если Chat уже существует, будут досинхронизированы участники канала
 * - если Chat отсутствует, будет создан
 *
 * Запуск:
 *   pnpm tsx scripts/resync-all-channel-participants.ts
 */

import { PrismaClient } from "@prisma/client";
import { syncChannelWithChat } from "@/lib/channel-sync";

const prisma = new PrismaClient();

async function main() {
  console.log("[resync-channels] Starting full channel sync...");

  const channels = await prisma.newsChannel.findMany({
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let success = 0;
  let failed = 0;

  for (const channel of channels) {
    try {
      const chatId = await syncChannelWithChat(channel.id, channel.organizationId ?? null);
      if (chatId) {
        success += 1;
        console.log(
          `[resync-channels] OK ${channel.id} "${channel.name}" -> chat ${chatId}`
        );
      } else {
        failed += 1;
        console.warn(
          `[resync-channels] FAIL ${channel.id} "${channel.name}" (chat not created/synced)`
        );
      }
    } catch (error) {
      failed += 1;
      console.error(
        `[resync-channels] ERROR ${channel.id} "${channel.name}":`,
        error
      );
    }
  }

  console.log(
    `[resync-channels] Done. total=${channels.length}, success=${success}, failed=${failed}`
  );
}

main()
  .catch((error) => {
    console.error("[resync-channels] Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

