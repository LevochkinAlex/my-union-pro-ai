/**
 * Утилиты для синхронизации NewsChannel с Chat
 */

import { prisma } from "@/lib/prisma";

/**
 * Создает Chat для NewsChannel, если его еще нет
 * Подписывает всех участников организации на канал
 */
export async function syncChannelWithChat(
  newsChannelId: string,
  organizationId: string
): Promise<string | null> {
  try {
    // Проверяем, есть ли уже Chat для этого канала
    const existingChat = await prisma.chat.findUnique({
      where: { newsChannelId },
      select: { id: true },
    });

    if (existingChat) {
      return existingChat.id;
    }

    // Получаем информацию о канале
    const channel = await prisma.newsChannel.findUnique({
      where: { id: newsChannelId },
      select: {
        id: true,
        name: true,
        description: true,
        iconUrl: true,
        createdById: true,
      },
    });

    if (!channel) {
      console.error(`[channel-sync] NewsChannel ${newsChannelId} not found`);
      return null;
    }

    // Получаем председателя организации
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        ppoChairman: {
          select: { id: true },
        },
        mpoChairman: {
          select: { id: true },
        },
        rpoChairman: {
          select: { id: true },
        },
      },
    });

    const chairmanId = organization?.ppoChairman?.id || 
                      organization?.mpoChairman?.id || 
                      organization?.rpoChairman?.id;

    if (!chairmanId) {
      console.error(`[channel-sync] No chairman found for organization ${organizationId}`);
      return null;
    }

    // Создаем Chat для канала
    const chat = await prisma.chat.create({
      data: {
        type: "CHANNEL",
        name: channel.name || "Канал",
        description: channel.description,
        iconUrl: channel.iconUrl,
        createdById: channel.createdById || chairmanId,
        newsChannelId: channel.id,
        participants: {
          create: {
            userId: chairmanId,
            role: "admin",
          },
        },
      },
    });

    // Подписываем всех участников организации на канал
    const members = await prisma.user.findMany({
      where: {
        organizationId,
        membershipStatus: "APPROVED",
      },
      select: { id: true },
    });

    // Добавляем участников (исключая председателя, который уже добавлен)
    const memberIds = members
      .map(m => m.id)
      .filter(id => id !== chairmanId);

    if (memberIds.length > 0) {
      await prisma.chatParticipant.createMany({
        data: memberIds.map(userId => ({
          chatId: chat.id,
          userId,
          role: "member",
        })),
        skipDuplicates: true,
      });
    }

    console.log(`[channel-sync] ✅ Created Chat ${chat.id} for NewsChannel ${newsChannelId}`);
    return chat.id;
  } catch (error) {
    console.error(`[channel-sync] Error syncing channel ${newsChannelId}:`, error);
    return null;
  }
}

/**
 * Синхронизирует все каналы организации с чатами
 */
export async function syncAllOrganizationChannels(organizationId: string): Promise<void> {
  try {
    const channels = await prisma.newsChannel.findMany({
      where: { organizationId },
      select: { id: true },
    });

    for (const channel of channels) {
      await syncChannelWithChat(channel.id, organizationId);
    }
  } catch (error) {
    console.error(`[channel-sync] Error syncing all channels for organization ${organizationId}:`, error);
  }
}
