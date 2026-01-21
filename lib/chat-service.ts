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

  // Если есть обращение, связываем с ним
  // Тикеты теперь связаны через matrixRoomId, а не chatId
  // if (options?.ticketId) {
  //   await prisma.ticket.update({
  //     where: { id: options.ticketId },
  //     data: { matrixRoomId: chat.matrixRoomId },
  //   });
  // }

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

  // Старая схема удалена - используем только ChatParticipant
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

  let lastReadAt: Date | null = participant?.readAt || null;

  // Сообщения теперь хранятся в Matrix, поэтому непрочитанные считаются через Matrix API
  // TODO: Интегрировать подсчет непрочитанных из Matrix
  return 0;
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

  // Строим map с временем прочтения
  const readAtMap = new Map<string, Date | null>();
  
  for (const p of participants) {
    readAtMap.set(p.chatId, p.readAt);
  }

  // Сообщения теперь хранятся в Matrix, поэтому непрочитанные считаются через Matrix API
  // TODO: Интегрировать подсчет непрочитанных из Matrix
  const results = new Map<string, number>();
  for (const chatId of chatIds) {
    results.set(chatId, 0);
  }
  
  return results;

  // Запрос для чатов с readAt (только новые сообщения)
  // Сообщения теперь хранятся в Matrix, поэтому непрочитанные считаются через Matrix API
  // TODO: Интегрировать подсчет непрочитанных из Matrix
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

  // Определяем отображаемое имя и аватар
  let displayName: string;
  let displayAvatar: string | null;
  let otherUser: OtherUserInfo | null = null;

  if (isGroup) {
    // Для групповых чатов
    displayName = chat.name || "Групповой чат";
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

    // Старая схема удалена - используем только ChatParticipant

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
    ticketId: null, // Тикеты теперь связаны через matrixRoomId
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

  // Сообщения теперь отправляются через Matrix API
  // TODO: Интегрировать отправку сообщений через Matrix API
  // const { sendMatrixMessage } = await import('@/lib/matrix-messages');
  // const senderUser = await prisma.user.findUnique({ where: { id: senderId }, select: { matrixAccessToken: true } });
  // if (senderUser?.matrixAccessToken && chat?.matrixRoomId) {
  //   await sendMatrixMessage(senderUser.matrixAccessToken, chat.matrixRoomId, content);
  // }

  // Получаем информацию об отправителе для возврата
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      avatarUrl: true,
    },
  });

  // Обновляем чат
  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessageAt: new Date(),
    },
  });

  // Создаем временный объект сообщения для обратной совместимости
  const message = {
    id: `temp_${Date.now()}`,
    chatId,
    senderId,
    content,
    replyToId: options?.replyToId,
    forwardedFromId: options?.forwardedFromId,
    createdAt: new Date(),
    sender: sender || {
      id: senderId,
      firstName: null,
      lastName: null,
      middleName: null,
      avatarUrl: null,
    },
    replyTo: null,
  };

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

  // Старая схема удалена - используем только ChatParticipant

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

  // Старая схема удалена - используем только ChatParticipant
  return [];
}

