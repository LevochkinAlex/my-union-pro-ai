/**
 * Единый сервис для работы с чатами
 * Унифицирует логику для PRIVATE и GROUP чатов через ChatParticipant
 * 
 * ВАЖНО: Использовать ТОЛЬКО на сервере!
 */

import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar, normalizeUsersAvatars } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

// ============================================================================
// ТИПЫ
// ============================================================================

export type ChatType = "PRIVATE" | "GROUP";
export type ParticipantRole = "admin" | "member";

export interface ChatFilter {
  type?: ChatType;
  hasTicket?: boolean; // Фильтр по наличию обращения
  searchQuery?: string;
}

export interface ChatInfo {
  id: string;
  type: ChatType;
  name: string | null;
  description: string | null;
  iconUrl: string | null;
  isPublic: boolean;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
  // Для отображения в UI
  displayName: string;
  displayAvatar: string | null;
  // Участники
  participants: ParticipantInfo[];
  participantsCount: number;
  // Для обращений
  ticketId: string | null;
  ticketPublicId: string | null;
  ticketTitle: string | null;
  // Другой участник (для PRIVATE чатов или основной собеседник в GROUP)
  otherUser: OtherUserInfo | null;
}

export interface ParticipantInfo {
  id: string;
  odvisId: string;
  userId: string;
  role: ParticipantRole;
  readAt: Date | null;
  joinedAt: Date;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
  };
}

export interface OtherUserInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  avatarUrl: string | null;
  phone?: string | null;
  isGroup?: boolean;
  participantsCount?: number;
}

// ============================================================================
// ПРОВЕРКА ДОСТУПА
// ============================================================================

/**
 * Проверяет, является ли пользователь участником чата
 * Унифицированная проверка для PRIVATE и GROUP чатов
 */
export async function checkChatAccess(
  chatId: string,
  userId: string
): Promise<{ hasAccess: boolean; chat: any | null; participant: any | null }> {
  // Получаем чат
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      type: true,
      name: true,
      participant1Id: true,
      participant2Id: true,
    },
  });

  if (!chat) {
    return { hasAccess: false, chat: null, participant: null };
  }

  // Временная поддержка старой схемы (PRIVATE чаты с participant1Id/participant2Id)
  // После миграции этот блок можно убрать
  if (chat.type === "PRIVATE" && (chat.participant1Id || chat.participant2Id)) {
    const hasAccess = chat.participant1Id === userId || chat.participant2Id === userId;
    return { 
      hasAccess, 
      chat, 
      participant: hasAccess ? { userId, role: "member" } : null 
    };
  }

  // Новая логика через ChatParticipant
  const participant = await prisma.chatParticipant.findFirst({
    where: {
      chatId,
      userId,
      leftAt: null,
    },
  });

  return {
    hasAccess: !!participant,
    chat,
    participant,
  };
}

/**
 * Проверяет доступ и возвращает ошибку если нет доступа
 * Удобная обёртка для API routes
 */
export async function requireChatAccess(
  chatId: string,
  userId: string
): Promise<{ chat: any; participant: any }> {
  const { hasAccess, chat, participant } = await checkChatAccess(chatId, userId);
  
  if (!hasAccess) {
    throw new ChatAccessError("Нет доступа к этому чату");
  }

  return { chat, participant };
}

export class ChatAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatAccessError";
  }
}

// ============================================================================
// ПОЛУЧЕНИЕ ЧАТОВ
// ============================================================================

/**
 * Получает список чатов пользователя с фильтрацией
 */
export async function getUserChats(
  userId: string,
  filter?: ChatFilter
): Promise<ChatInfo[]> {
  // Строим условие WHERE
  const whereConditions: Prisma.ChatWhereInput[] = [];

  // Базовое условие: пользователь - участник чата
  // Поддержка как старой схемы (participant1Id/participant2Id), так и новой (ChatParticipant)
  whereConditions.push({
    OR: [
      // Старая схема PRIVATE чатов
      { participant1Id: userId },
      { participant2Id: userId },
      // Новая схема через ChatParticipant
      {
        participants: {
          some: {
            userId,
            leftAt: null,
          },
        },
      },
    ],
  });

  // Фильтр по типу
  if (filter?.type) {
    whereConditions.push({ type: filter.type });
  }

  // Фильтр по наличию обращения
  if (filter?.hasTicket !== undefined) {
    whereConditions.push({
      ticket: filter.hasTicket ? { isNot: null } : { is: null },
    });
  }

  // Получаем чаты
  const chats = await prisma.chat.findMany({
    where: {
      AND: whereConditions,
    },
    include: {
      // Старая схема
      participant1: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
          phone: true,
        },
      },
      participant2: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
          phone: true,
        },
      },
      // Новая схема
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
              phone: true,
            },
          },
        },
      },
      // Обращение
      ticket: {
        select: {
          id: true,
          publicId: true,
          title: true,
        },
      },
      _count: {
        select: {
          participants: true,
          messages: true,
        },
      },
    },
    orderBy: {
      lastMessageAt: "desc",
    },
  });

  // Получаем количество непрочитанных сообщений для всех чатов одним запросом
  const unreadCounts = await getUnreadCountsForChats(
    chats.map((c) => c.id),
    userId
  );

  // Форматируем чаты
  return chats.map((chat) => formatChatInfo(chat, userId, unreadCounts.get(chat.id) || 0));
}

/**
 * Получает информацию о конкретном чате
 */
export async function getChatById(
  chatId: string,
  userId: string
): Promise<ChatInfo | null> {
  const { hasAccess, chat: basicChat } = await checkChatAccess(chatId, userId);
  
  if (!hasAccess || !basicChat) {
    return null;
  }

  // Загружаем полную информацию
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      participant1: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
          phone: true,
        },
      },
      participant2: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
          phone: true,
        },
      },
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
              phone: true,
            },
          },
        },
      },
      ticket: {
        select: {
          id: true,
          publicId: true,
          title: true,
        },
      },
      _count: {
        select: {
          participants: true,
          messages: true,
        },
      },
    },
  });

  if (!chat) return null;

  const unreadCount = await getUnreadCount(chatId, userId);
  return formatChatInfo(chat, userId, unreadCount);
}

// ============================================================================
// СОЗДАНИЕ ЧАТОВ
// ============================================================================

/**
 * Создает или находит личный чат между двумя пользователями
 * Использует ChatParticipant для унификации
 */
export async function getOrCreatePrivateChat(
  userId1: string,
  userId2: string
): Promise<{ chat: any; isNew: boolean }> {
  // Нормализуем ID (меньший первый) для консистентности
  const [firstUserId, secondUserId] = userId1 < userId2 
    ? [userId1, userId2] 
    : [userId2, userId1];

  // Ищем существующий чат (поддержка обеих схем)
  let chat = await prisma.chat.findFirst({
    where: {
      type: "PRIVATE",
      OR: [
        // Старая схема
        {
          participant1Id: firstUserId,
          participant2Id: secondUserId,
        },
        // Новая схема: оба пользователя - участники
        {
          AND: [
            {
              participants: {
                some: { userId: firstUserId, leftAt: null },
              },
            },
            {
              participants: {
                some: { userId: secondUserId, leftAt: null },
              },
            },
          ],
        },
      ],
    },
    include: {
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  if (chat) {
    return { chat, isNew: false };
  }

  // Создаем новый чат с использованием ChatParticipant
  chat = await prisma.chat.create({
    data: {
      type: "PRIVATE",
      // Оставляем старые поля для обратной совместимости (временно)
      participant1Id: firstUserId,
      participant2Id: secondUserId,
      // Создаем участников через ChatParticipant
      participants: {
        create: [
          { userId: firstUserId, role: "member" },
          { userId: secondUserId, role: "member" },
        ],
      },
    },
    include: {
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  return { chat, isNew: true };
}

/**
 * Создает групповой чат
 */
export async function createGroupChat(
  creatorId: string,
  name: string,
  description: string | null,
  participantIds: string[],
  options?: {
    iconUrl?: string;
    isPublic?: boolean;
    ticketId?: string;
  }
): Promise<any> {
  // Убеждаемся что создатель в списке участников
  const allParticipantIds = [...new Set([creatorId, ...participantIds])];

  const chat = await prisma.chat.create({
    data: {
      type: "GROUP",
      name,
      description,
      iconUrl: options?.iconUrl,
      isPublic: options?.isPublic ?? true,
      createdById: creatorId,
      participants: {
        create: allParticipantIds.map((userId) => ({
          userId,
          role: userId === creatorId ? "admin" : "member",
        })),
      },
    },
    include: {
      participants: {
        where: { leftAt: null },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  // Если есть обращение, связываем с ним
  if (options?.ticketId) {
    await prisma.ticket.update({
      where: { id: options.ticketId },
      data: { chatId: chat.id },
    });
  }

  return chat;
}

// ============================================================================
// УПРАВЛЕНИЕ УЧАСТНИКАМИ
// ============================================================================

/**
 * Добавляет участника в групповой чат
 */
export async function addParticipant(
  chatId: string,
  userId: string,
  invitedById: string,
  role: ParticipantRole = "member"
): Promise<any> {
  // Проверяем, что это групповой чат
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true },
  });

  if (!chat || chat.type !== "GROUP") {
    throw new Error("Можно добавлять участников только в групповые чаты");
  }

  // Проверяем, не является ли уже участником
  const existingParticipant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId },
  });

  if (existingParticipant) {
    if (existingParticipant.leftAt) {
      // Пользователь раньше вышел - восстанавливаем
      return prisma.chatParticipant.update({
        where: { id: existingParticipant.id },
        data: {
          leftAt: null,
          role,
          invitedById,
          joinedAt: new Date(),
        },
      });
    }
    // Уже активный участник
    return existingParticipant;
  }

  // Добавляем нового участника
  return prisma.chatParticipant.create({
    data: {
      chatId,
      userId,
      role,
      invitedById,
    },
  });
}

/**
 * Удаляет участника из чата (soft delete)
 */
export async function removeParticipant(
  chatId: string,
  userId: string
): Promise<void> {
  await prisma.chatParticipant.updateMany({
    where: {
      chatId,
      userId,
      leftAt: null,
    },
    data: {
      leftAt: new Date(),
    },
  });
}

// ============================================================================
// СТАТУС ПРОЧТЕНИЯ
// ============================================================================

/**
 * Помечает чат как прочитанный для пользователя
 */
export async function markAsRead(chatId: string, userId: string): Promise<void> {
  const now = new Date();

  // Обновляем через ChatParticipant
  await prisma.chatParticipant.updateMany({
    where: {
      chatId,
      userId,
      leftAt: null,
    },
    data: {
      readAt: now,
    },
  });

  // Также обновляем старую схему (для совместимости)
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { participant1Id: true, participant2Id: true },
  });

  if (chat) {
    if (chat.participant1Id === userId) {
      await prisma.chat.update({
        where: { id: chatId },
        data: { participant1ReadAt: now },
      });
    } else if (chat.participant2Id === userId) {
      await prisma.chat.update({
        where: { id: chatId },
        data: { participant2ReadAt: now },
      });
    }
  }
}

/**
 * Получает количество непрочитанных сообщений в чате для пользователя
 */
export async function getUnreadCount(
  chatId: string,
  userId: string
): Promise<number> {
  // Получаем время последнего прочтения
  const participant = await prisma.chatParticipant.findFirst({
    where: { chatId, userId, leftAt: null },
    select: { readAt: true },
  });

  // Также проверяем старую схему
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: {
      participant1Id: true,
      participant2Id: true,
      participant1ReadAt: true,
      participant2ReadAt: true,
    },
  });

  let lastReadAt: Date | null = participant?.readAt || null;
  
  // Fallback на старую схему
  if (!lastReadAt && chat) {
    if (chat.participant1Id === userId) {
      lastReadAt = chat.participant1ReadAt;
    } else if (chat.participant2Id === userId) {
      lastReadAt = chat.participant2ReadAt;
    }
  }

  // Считаем непрочитанные
  const where: any = {
    chatId,
    senderId: { not: userId },
    deletedAt: null,
  };

  if (lastReadAt) {
    where.createdAt = { gt: lastReadAt };
  }

  return prisma.chatMessage.count({ where });
}

/**
 * Получает количество непрочитанных для нескольких чатов одним запросом
 */
async function getUnreadCountsForChats(
  chatIds: string[],
  userId: string
): Promise<Map<string, number>> {
  if (chatIds.length === 0) {
    return new Map();
  }

  // Получаем участников для всех чатов
  const participants = await prisma.chatParticipant.findMany({
    where: {
      chatId: { in: chatIds },
      userId,
      leftAt: null,
    },
    select: { chatId: true, readAt: true },
  });

  // Получаем чаты для fallback на старую схему
  const chats = await prisma.chat.findMany({
    where: { id: { in: chatIds } },
    select: {
      id: true,
      participant1Id: true,
      participant2Id: true,
      participant1ReadAt: true,
      participant2ReadAt: true,
    },
  });

  // Строим map с временем прочтения
  const readAtMap = new Map<string, Date | null>();
  
  for (const p of participants) {
    readAtMap.set(p.chatId, p.readAt);
  }

  // Fallback на старую схему для чатов без ChatParticipant
  for (const chat of chats) {
    if (!readAtMap.has(chat.id)) {
      if (chat.participant1Id === userId) {
        readAtMap.set(chat.id, chat.participant1ReadAt);
      } else if (chat.participant2Id === userId) {
        readAtMap.set(chat.id, chat.participant2ReadAt);
      }
    }
  }

  // Подсчитываем непрочитанные для каждого чата
  const results = new Map<string, number>();

  // Группируем по наличию/отсутствию readAt для оптимизации
  const chatsWithReadAt: { chatId: string; readAt: Date }[] = [];
  const chatsWithoutReadAt: string[] = [];

  for (const chatId of chatIds) {
    const readAt = readAtMap.get(chatId);
    if (readAt) {
      chatsWithReadAt.push({ chatId, readAt });
    } else {
      chatsWithoutReadAt.push(chatId);
    }
  }

  // Запрос для чатов без readAt (все сообщения непрочитаны)
  if (chatsWithoutReadAt.length > 0) {
    const counts = await prisma.chatMessage.groupBy({
      by: ["chatId"],
      where: {
        chatId: { in: chatsWithoutReadAt },
        senderId: { not: userId },
        deletedAt: null,
      },
      _count: { id: true },
    });

    for (const c of counts) {
      results.set(c.chatId, c._count.id);
    }
  }

  // Запрос для чатов с readAt (только новые сообщения)
  // Делаем по одному запросу для каждого чата (можно оптимизировать через raw SQL)
  const readAtCounts = await Promise.all(
    chatsWithReadAt.slice(0, 50).map(async ({ chatId, readAt }) => {
      const count = await prisma.chatMessage.count({
        where: {
          chatId,
          senderId: { not: userId },
          deletedAt: null,
          createdAt: { gt: readAt },
        },
      });
      return { chatId, count };
    })
  );

  for (const { chatId, count } of readAtCounts) {
    results.set(chatId, count);
  }

  return results;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Форматирует данные чата для API ответа
 */
function formatChatInfo(
  chat: any,
  currentUserId: string,
  unreadCount: number
): ChatInfo {
  const isGroup = chat.type === "GROUP";

  // Определяем отображаемое имя и аватар
  let displayName: string;
  let displayAvatar: string | null;
  let otherUser: OtherUserInfo | null = null;

  if (isGroup) {
    // Для групповых чатов
    displayName = chat.name || (chat.ticket ? `Обращение #${chat.ticket.publicId}` : "Групповой чат");
    displayAvatar = chat.iconUrl || null;

    // Находим другого участника для показа в превью
    const otherParticipant = chat.participants?.find(
      (p: any) => p.userId !== currentUserId
    );
    if (otherParticipant?.user) {
      const normalized = normalizeUserAvatar(otherParticipant.user);
      otherUser = {
        id: chat.id,
        firstName: null,
        lastName: displayName,
        middleName: null,
        avatarUrl: displayAvatar,
        isGroup: true,
        participantsCount: chat._count?.participants || chat.participants?.length || 0,
      };
    } else {
      otherUser = {
        id: chat.id,
        firstName: null,
        lastName: displayName,
        middleName: null,
        avatarUrl: displayAvatar,
        isGroup: true,
        participantsCount: chat._count?.participants || chat.participants?.length || 0,
      };
    }
  } else {
    // Для личных чатов
    // Пробуем найти через ChatParticipant
    let other = chat.participants?.find(
      (p: any) => p.userId !== currentUserId
    )?.user;

    // Fallback на старую схему
    if (!other) {
      other = chat.participant1Id === currentUserId 
        ? chat.participant2 
        : chat.participant1;
    }

    if (other) {
      const normalized = normalizeUserAvatar(other);
      displayName = getUserDisplayName(normalized);
      displayAvatar = normalized.avatarUrl;
      otherUser = {
        id: normalized.id,
        firstName: normalized.firstName,
        lastName: normalized.lastName,
        middleName: normalized.middleName,
        avatarUrl: normalized.avatarUrl,
        phone: normalized.phone,
      };
    } else {
      displayName = "Пользователь";
      displayAvatar = null;
      otherUser = {
        id: "",
        firstName: null,
        lastName: null,
        middleName: null,
        avatarUrl: null,
      };
    }
  }

  // Форматируем участников
  const participants: ParticipantInfo[] = (chat.participants || []).map((p: any) => ({
    id: p.id,
    odvisId: p.id,
    userId: p.userId,
    role: p.role as ParticipantRole,
    readAt: p.readAt,
    joinedAt: p.joinedAt,
    user: p.user ? normalizeUserAvatar(p.user) : null,
  }));

  return {
    id: chat.id,
    type: chat.type as ChatType,
    name: chat.name,
    description: chat.description,
    iconUrl: chat.iconUrl,
    isPublic: chat.isPublic ?? true,
    lastMessage: chat.lastMessage,
    lastMessageAt: chat.lastMessageAt,
    unreadCount,
    createdAt: chat.createdAt,
    displayName,
    displayAvatar,
    participants,
    participantsCount: chat._count?.participants || participants.length,
    ticketId: chat.ticket?.id || null,
    ticketPublicId: chat.ticket?.publicId || null,
    ticketTitle: chat.ticket?.title || null,
    otherUser,
  };
}

/**
 * Получает отображаемое имя пользователя
 */
function getUserDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  middleName?: string | null;
}): string {
  const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Пользователь";
}

// ============================================================================
// ОТПРАВКА СООБЩЕНИЙ
// ============================================================================

/**
 * Отправляет сообщение в чат
 */
export async function sendMessage(
  chatId: string,
  senderId: string,
  content: string,
  options?: {
    replyToId?: string;
    forwardedFromId?: string;
  }
): Promise<any> {
  // Проверяем доступ
  const { hasAccess, chat } = await checkChatAccess(chatId, senderId);
  if (!hasAccess) {
    throw new ChatAccessError("Нет доступа к этому чату");
  }

  // Создаем сообщение
  const message = await prisma.chatMessage.create({
    data: {
      chatId,
      senderId,
      content,
      replyToId: options?.replyToId,
      forwardedFromId: options?.forwardedFromId,
    },
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          avatarUrl: true,
        },
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          sender: {
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

  // Обновляем чат
  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessage: content.substring(0, 100),
      lastMessageAt: new Date(),
    },
  });

  // Сбрасываем readAt для всех участников кроме отправителя
  await prisma.chatParticipant.updateMany({
    where: {
      chatId,
      userId: { not: senderId },
      leftAt: null,
    },
    data: {
      readAt: null,
    },
  });

  // Также для старой схемы
  if (chat?.participant1Id || chat?.participant2Id) {
    const updateData: any = {};
    if (chat.participant1Id === senderId) {
      updateData.participant2ReadAt = null;
    } else if (chat.participant2Id === senderId) {
      updateData.participant1ReadAt = null;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.chat.update({
        where: { id: chatId },
        data: updateData,
      });
    }
  }

  return {
    ...message,
    sender: normalizeUserAvatar(message.sender),
  };
}

/**
 * Получает всех участников чата (для уведомлений)
 */
export async function getChatParticipantIds(
  chatId: string,
  excludeUserId?: string
): Promise<string[]> {
  // Через ChatParticipant
  const participants = await prisma.chatParticipant.findMany({
    where: {
      chatId,
      leftAt: null,
      ...(excludeUserId && { userId: { not: excludeUserId } }),
    },
    select: { userId: true },
  });

  if (participants.length > 0) {
    return participants.map((p) => p.userId);
  }

  // Fallback на старую схему
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { participant1Id: true, participant2Id: true },
  });

  if (!chat) return [];

  const ids: string[] = [];
  if (chat.participant1Id && chat.participant1Id !== excludeUserId) {
    ids.push(chat.participant1Id);
  }
  if (chat.participant2Id && chat.participant2Id !== excludeUserId) {
    ids.push(chat.participant2Id);
  }

  return ids;
}

