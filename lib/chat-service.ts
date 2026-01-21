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
    },
  });

  if (!chat) {
    return { hasAccess: false, chat: null, participant: null };
  }

  // Проверяем доступ через ChatParticipant
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
  whereConditions.push({
    participants: {
      some: {
        userId,
        leftAt: null,
      },
    },
  });

  // Фильтр по типу
  if (filter?.type) {
    whereConditions.push({ type: filter.type });
  }

  // Фильтр по наличию обращения (проверяем связь с Ticket через chatId)
  if (filter?.hasTicket !== undefined) {
    // Получаем все chatId из тикетов
    const tickets = await prisma.ticket.findMany({
      where: { chatId: { not: null } },
      select: { chatId: true },
    });
    const ticketChatIds = tickets
      .map(t => t.chatId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    
    if (filter.hasTicket) {
      // Только чаты, которые связаны с обращениями (есть Ticket с таким chatId)
      if (ticketChatIds.length > 0) {
        whereConditions.push({
          id: { in: ticketChatIds },
        });
      } else {
        // Если нет обращений, возвращаем пустой результат через невозможное условие
        whereConditions.push({ 
          id: 'nonexistent_chat_id_to_ensure_empty_result_when_no_tickets'
        });
      }
    } else {
      // Все чаты, кроме связанных с обращениями
      if (ticketChatIds.length > 0) {
        whereConditions.push({
          id: { notIn: ticketChatIds },
        });
      }
    }
  }

  // Получаем чаты
  const chats = await prisma.chat.findMany({
    where: {
      AND: whereConditions,
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
              phone: true,
            },
          },
        },
      },
      _count: {
        select: {
          participants: true,
          // messages: true, // Модель ChatMessage удалена - все сообщения в Matrix
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
      _count: {
        select: {
          participants: true,
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

  // Ищем существующий чат
  let chat = await prisma.chat.findFirst({
    where: {
      type: "PRIVATE",
      // Оба пользователя - участники
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
  try {
    console.log(`[chat-service] Creating new PRIVATE chat between ${firstUserId} and ${secondUserId}`);
    
    // Проверяем, что оба пользователя существуют
    const [user1, user2] = await Promise.all([
      prisma.user.findUnique({ where: { id: firstUserId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: secondUserId }, select: { id: true } }),
    ]);
    
    if (!user1 || !user2) {
      throw new Error(`One or both users not found: ${firstUserId}, ${secondUserId}`);
    }
    
    chat = await prisma.chat.create({
      data: {
        type: "PRIVATE",
        // Создаем участников через ChatParticipant
        participants: {
          create: [
            { userId: firstUserId, role: "member", invitedById: firstUserId },
            { userId: secondUserId, role: "member", invitedById: firstUserId },
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
    console.log(`[chat-service] Successfully created chat ${chat.id}`);
  } catch (error: any) {
    console.error('[chat-service] Error creating chat:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack?.substring(0, 500),
    });
    throw error;
  }

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

  if (!chat) {
    throw new Error("Чат не найден");
  }

  if (chat.type !== "GROUP") {
    // Если приватный чат получает 3-го участника, меняем тип на GROUP
    if (chat.type === "PRIVATE") {
      const activeParticipants = await prisma.chatParticipant.count({
        where: { chatId, leftAt: null },
      });
      
      if (activeParticipants === 1) {
        // Меняем тип на GROUP перед добавлением второго участника
        await prisma.chat.update({
          where: { id: chatId },
          data: { type: "GROUP" },
        });
        console.log(`[chat-service] Changed chat ${chatId} type from PRIVATE to GROUP`);
      } else {
        throw new Error("Можно добавлять участников только в групповые чаты");
      }
    } else {
      throw new Error("Можно добавлять участников только в групповые чаты");
    }
  }

  // Проверяем, что пользователь существует
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`Пользователь ${userId} не найден`);
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
    // Уже активный участник - возвращаем существующую запись
    console.log(`[chat-service] User ${userId} is already a participant in chat ${chatId}`);
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

}

/**
 * Получает количество непрочитанных сообщений в чате для пользователя
 * 
 * NOTE: Сообщения хранятся в локальной БД (ChatMessage).
 * Считаем сообщения созданные после последнего прочтения.
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

  if (!participant) return 0;
  
  const lastReadAt = participant.readAt;

  // Если никогда не читал - считаем все сообщения
  if (!lastReadAt) {
    return await prisma.chatMessage.count({
      where: {
        chatId,
        senderId: { not: userId },
        deletedAt: null,
      },
    });
  }

  // Считаем сообщения после последнего прочтения
  return await prisma.chatMessage.count({
    where: {
      chatId,
      senderId: { not: userId },
      createdAt: { gt: lastReadAt },
      deletedAt: null,
    },
  });
}

/**
 * Получает количество непрочитанных для нескольких чатов одним запросом
 * Оптимизированная версия для batch-загрузки
 */
async function getUnreadCountsForChats(
  chatIds: string[],
  userId: string
): Promise<Map<string, number>> {
  if (chatIds.length === 0) {
    return new Map();
  }

  const results = new Map<string, number>();
  
  // Инициализируем все чаты нулём
  for (const chatId of chatIds) {
    results.set(chatId, 0);
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

  // Строим map с временем прочтения
  const readAtMap = new Map<string, Date | null>();
  for (const p of participants) {
    readAtMap.set(p.chatId, p.readAt);
  }

  // Для чатов где readAt = null, считаем все сообщения от других
  const unreadChats = chatIds.filter(id => !readAtMap.get(id));
  if (unreadChats.length > 0) {
    const counts = await prisma.chatMessage.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: unreadChats },
        senderId: { not: userId },
        deletedAt: null,
      },
      _count: true,
    });
    
    for (const item of counts) {
      results.set(item.chatId, item._count);
    }
  }

  // Для чатов с readAt считаем сообщения после этого времени
  const readChats = chatIds.filter(id => readAtMap.get(id));
  for (const chatId of readChats) {
    const readAt = readAtMap.get(chatId)!;
    const count = await prisma.chatMessage.count({
      where: {
        chatId,
        senderId: { not: userId },
        createdAt: { gt: readAt },
        deletedAt: null,
      },
    });
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
export function formatChatInfo(
  chat: any,
  currentUserId: string,
  unreadCount: number
): ChatInfo {
  const isGroup = chat.type === "GROUP";
  const participantsCount = chat._count?.participants || chat.participants?.length || 0;

  // Находим другого участника
  const otherParticipant = chat.participants?.find(
    (p: any) => p.userId !== currentUserId
  );
  const other = otherParticipant?.user;

  // Определяем отображаемые данные
  let displayName: string;
  let displayAvatar: string | null;
  let otherUser: OtherUserInfo;

  if (isGroup) {
    displayName = chat.name || "Групповой чат";
    displayAvatar = chat.iconUrl || null;
    otherUser = {
      id: chat.id,
      firstName: null,
      lastName: displayName,
      middleName: null,
      avatarUrl: displayAvatar,
      isGroup: true,
      participantsCount,
    };
  } else if (other) {
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
    ticketId: null,
    ticketPublicId: null,
    ticketTitle: null,
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
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ОТПРАВКИ
// ============================================================================

/**
 * Сбрасывает readAt для всех участников чата кроме отправителя
 * Используется после отправки сообщения через API
 */
export async function resetReadStatusForOthers(
  chatId: string,
  senderId: string
): Promise<void> {
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
}

/**
 * Обновляет время последнего сообщения в чате
 */
export async function updateChatLastMessage(
  chatId: string,
  messageId?: string
): Promise<void> {
  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessageAt: new Date(),
      ...(messageId && { lastMessageId: messageId }),
    },
  });
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

  return participants.map((p) => p.userId);
}

