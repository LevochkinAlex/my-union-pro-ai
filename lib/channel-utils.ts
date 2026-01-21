import { prisma } from "@/lib/prisma";

/**
 * Создает дефолтный канал для организации председателя
 */
export async function createDefaultChannelForOrganization(
  organizationId: string,
  chairmanId: string
): Promise<{ chatId: string; newsChannelId: string } | null> {
  try {
    // Проверяем, есть ли уже дефолтный канал
    const existingChannel = await prisma.newsChannel.findFirst({
      where: {
        organizationId,
        isMain: true,
      },
      include: {
        chat: true,
      },
    });

    if (existingChannel?.chat) {
      return {
        chatId: existingChannel.chat.id,
        newsChannelId: existingChannel.id,
      };
    }

    // Получаем организацию для названия канала
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const channelName = organization?.name || "Канал организации";

    // Создаем NewsChannel
    const newsChannel = await prisma.newsChannel.create({
      data: {
        name: channelName,
        description: `Официальный канал организации "${channelName}"`,
        organizationId,
        createdById: chairmanId,
        isMain: true,
      },
    });

    // Создаем Chat типа CHANNEL
    const chat = await prisma.chat.create({
      data: {
        type: "CHANNEL",
        name: channelName,
        description: `Официальный канал организации "${channelName}"`,
        createdById: chairmanId,
        newsChannelId: newsChannel.id,
        participants: {
          create: {
            userId: chairmanId,
            role: "admin",
          },
        },
      },
    });

    return {
      chatId: chat.id,
      newsChannelId: newsChannel.id,
    };
  } catch (error) {
    console.error("[channel-utils] Error creating default channel:", error);
    return null;
  }
}

/**
 * Подписывает пользователя на канал организации
 */
export async function subscribeUserToOrganizationChannel(
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    // Находим дефолтный канал организации
    const channel = await prisma.newsChannel.findFirst({
      where: {
        organizationId,
        isMain: true,
      },
      include: {
        chat: {
          include: {
            participants: {
              where: { userId, leftAt: null },
            },
          },
        },
      },
    });

    if (!channel?.chat) {
      console.warn(`[channel-utils] No default channel found for organization ${organizationId}`);
      return false;
    }

    // Проверяем, не подписан ли уже
    if (channel.chat.participants.length > 0) {
      return true; // Уже подписан
    }

    // Добавляем пользователя в участники чата
    await prisma.chatParticipant.create({
      data: {
        chatId: channel.chat.id,
        userId,
        role: "member",
      },
    });

    return true;
  } catch (error) {
    console.error("[channel-utils] Error subscribing user to channel:", error);
    return false;
  }
}
