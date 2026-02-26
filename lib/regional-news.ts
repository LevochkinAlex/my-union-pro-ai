import { prisma } from "@/lib/prisma";
import { syncChannelWithChat } from "@/lib/channel-sync";

export const REGIONAL_NEWS_CHANNEL_NAME = "Региональные новости";

export async function getOrCreateRegionalNewsChannel(createdById: string) {
  let channel = await prisma.newsChannel.findFirst({
    where: {
      organizationId: null,
      name: REGIONAL_NEWS_CHANNEL_NAME,
    },
    select: {
      id: true,
      name: true,
      description: true,
      iconUrl: true,
      isMain: true,
      organizationId: true,
    },
  });

  if (!channel) {
    channel = await prisma.newsChannel.create({
      data: {
        name: REGIONAL_NEWS_CHANNEL_NAME,
        description: "Глобальный канал новостей для всех пользователей платформы",
        organizationId: null,
        createdById,
        isMain: false,
        globalScopeKey: "REGIONAL_NEWS_GLOBAL",
      },
      select: {
        id: true,
        name: true,
        description: true,
        iconUrl: true,
        isMain: true,
        organizationId: true,
      },
    });
  }

  await syncChannelWithChat(channel.id, null);
  return channel;
}
