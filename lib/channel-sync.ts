/**
 * Утилиты для синхронизации NewsChannel с Chat
 */

import { prisma } from "@/lib/prisma";
import { REGIONAL_NEWS_CHANNEL_NAME } from "@/lib/regional-news";

async function ensureChannelParticipants(
  chatId: string,
  organizationId: string | null | undefined,
  chairmanId: string
): Promise<void> {
  // Для канала организации подписываем:
  // 1) одобренных пользователей этой организации,
  // 2) всех активных сотрудников этой организации (независимо от membershipStatus).
  // Для регионального канала — всех одобренных пользователей.
  const members = await prisma.user.findMany({
    where: organizationId
      ? {
          OR: [
            {
              organizationId,
              membershipStatus: "APPROVED",
            },
            {
              staffPositions: {
                some: {
                  organizationId,
                  status: "ACTIVE",
                },
              },
            },
          ],
        }
      : {
          membershipStatus: "APPROVED",
        },
    select: { id: true },
  });

  const targetMemberIds = members.map((m) => m.id);
  const existingParticipants = await prisma.chatParticipant.findMany({
    where: {
      chatId,
      userId: { in: [chairmanId, ...targetMemberIds] },
    },
    select: { userId: true, leftAt: true, role: true },
  });

  const byUserId = new Map(
    existingParticipants
      .filter((p): p is { userId: string; leftAt: Date | null; role: string } => Boolean(p.userId))
      .map((p) => [p.userId, p])
  );

  // Председатель должен быть активным админом канала
  const chairmanParticipant = byUserId.get(chairmanId);
  if (!chairmanParticipant) {
    await prisma.chatParticipant.create({
      data: {
        chatId,
        userId: chairmanId,
        role: "admin",
      },
    });
  } else if (chairmanParticipant.leftAt !== null || chairmanParticipant.role !== "admin") {
    await prisma.chatParticipant.update({
      where: { chatId_userId: { chatId, userId: chairmanId } },
      data: {
        leftAt: null,
        role: "admin",
      },
    });
  }

  const missingMemberIds: string[] = [];
  const rejoinMemberIds: string[] = [];
  for (const memberId of targetMemberIds) {
    if (memberId === chairmanId) continue;
    const existing = byUserId.get(memberId);
    if (!existing) {
      missingMemberIds.push(memberId);
    } else if (existing.leftAt !== null) {
      rejoinMemberIds.push(memberId);
    }
  }

  if (rejoinMemberIds.length > 0) {
    await prisma.chatParticipant.updateMany({
      where: { chatId, userId: { in: rejoinMemberIds } },
      data: { leftAt: null, role: "member" },
    });
  }

  if (missingMemberIds.length > 0) {
    await prisma.chatParticipant.createMany({
      data: missingMemberIds.map((userId) => ({
        chatId,
        userId,
        role: "member",
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * Создает Chat для NewsChannel, если его еще нет
 * Подписывает всех участников организации на канал
 */
export async function syncChannelWithChat(
  newsChannelId: string,
  organizationId?: string | null
): Promise<string | null> {
  try {
    // Проверяем, есть ли уже Chat для этого канала
    const existingChat = await prisma.chat.findUnique({
      where: { newsChannelId },
      select: { id: true },
    });

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

    // Получаем председателя: для org — председатель организации, для регионального канала — РПО
    let chairmanId: string | null = null;
    if (organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          ppoChairman: { select: { id: true } },
          mpoChairman: { select: { id: true } },
          rpoChairman: { select: { id: true } },
        },
      });
      chairmanId =
        organization?.ppoChairman?.id ||
        organization?.mpoChairman?.id ||
        organization?.rpoChairman?.id ||
        null;
    } else if (channel.name === REGIONAL_NEWS_CHANNEL_NAME) {
      // Региональный канал: админом должен быть председатель РПО
      const rpoOrg = await prisma.organization.findFirst({
        where: { type: "REGIONAL" },
        select: { rpoChairman: { select: { id: true } } },
      });
      chairmanId = rpoOrg?.rpoChairman?.id ?? null;
    }

    if (!chairmanId && channel.createdById) {
      chairmanId = channel.createdById;
    }

    if (!chairmanId) {
      console.error(`[channel-sync] No chairman/creator found for channel ${newsChannelId}`);
      return null;
    }

    if (existingChat) {
      // Канал уже создан: дополнительно синхронизируем подписки участников
      await ensureChannelParticipants(existingChat.id, organizationId ?? null, chairmanId);
      return existingChat.id;
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

    await ensureChannelParticipants(chat.id, organizationId ?? null, chairmanId);

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

/**
 * Для РПО: синхронизирует каналы своей организации и всех подчинённых,
 * добавляет РПО в участники чатов каналов подчинённых организаций (наблюдение).
 */
export async function syncRpoHeadChannels(
  rpoUserId: string,
  rpoOrgId: string
): Promise<void> {
  const { getOrgHeadScope } = await import("@/lib/org-head-permissions");
  const scope = await getOrgHeadScope(rpoUserId);
  if (!scope || scope.organizationIds.length === 0) return;

  for (const orgId of scope.organizationIds) {
    await syncAllOrganizationChannels(orgId).catch((err) =>
      console.warn(`[channel-sync] sync org ${orgId} for RPO:`, err)
    );
  }

  const childIds = scope.organizationIds.slice(1);
  if (childIds.length === 0) return;

  const childChannelChats = await prisma.chat.findMany({
    where: {
      type: "CHANNEL",
      newsChannel: { organizationId: { in: childIds } },
    },
    select: { id: true },
  });

  for (const chat of childChannelChats) {
    const existing = await prisma.chatParticipant.findUnique({
      where: {
        chatId_userId: { chatId: chat.id, userId: rpoUserId },
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.chatParticipant.create({
        data: { chatId: chat.id, userId: rpoUserId, role: "member" },
      }).catch((err) =>
        console.warn(`[channel-sync] Add RPO to chat ${chat.id}:`, err)
      );
    }
  }
}
