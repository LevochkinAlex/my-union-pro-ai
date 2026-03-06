/**
 * Единый сервис для работы с чатами
 * Унифицирует логику для PRIVATE и GROUP чатов через ChatParticipant
 * 
 * ВАЖНО: Использовать ТОЛЬКО на сервере!
 */

import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar, normalizeUsersAvatars } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { invalidateUserChatsCache, invalidateChatCache } from "@/lib/chat-redis";
import { checkUserPermissions } from "@/lib/staff-permissions";

// ============================================================================
// ТИПЫ
// ============================================================================

export type ChatType = "PRIVATE" | "GROUP" | "CHANNEL";
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
  /** Дата архивации чата (null если не архивирован) */
  archivedAt: Date | null;
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
  /** Чат заседания (групповой чат участников заседания) */
  meetingId: string | null;
  /** Организация канала (null = региональный канал). Для фильтрации: показывать только каналы своей org или региональный */
  newsChannelOrganizationId: string | null;
  // Другой участник (для PRIVATE чатов или основной собеседник в GROUP)
  otherUser: OtherUserInfo | null;
}

export interface ParticipantInfo {
  id: string;
  odvisId: string;
  userId: string | null;
  role: ParticipantRole;
  readAt: Date | null;
  joinedAt: Date;
  /** null для удалённого пользователя (показывать deletedUserDisplayName) */
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
  } | null;
  deletedUserDisplayName?: string | null;
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
  /** Удалённый пользователь: показывать плейсхолдер «Удалённый пользователь» */
  isDeleted?: boolean;
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
  // Получаем чат (включая meetingId и связь с обращением для чатов обращений)
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      type: true,
      name: true,
      meetingId: true,
      ticket: {
        select: {
          id: true,
          organizationId: true,
          userId: true, // автор обращения — всегда даём доступ к своему чату
        },
      },
    },
  });

  if (!chat) {
    return { hasAccess: false, chat: null, participant: null };
  }

  // Проверяем доступ через ChatParticipant
  let participant = await prisma.chatParticipant.findFirst({
    where: {
      chatId,
      userId,
      leftAt: null,
    },
  });

  // Если не в чате, но это групповой чат заседания — разрешаем доступ участникам заседания
  if (!participant && chat.meetingId) {
    const meetingParticipant = await prisma.meetingParticipant.findFirst({
      where: {
        meetingId: chat.meetingId,
        userId,
      },
      select: { id: true },
    });
    if (meetingParticipant) {
      return { hasAccess: true, chat, participant: null };
    }
  }

  // Если не участник, но чат привязан к обращению — разрешаем доступ:
  // 1) автору обращения (Ticket.userId) — всегда;
  // 2) председателю или сотрудникам с правом appeals_view той же организации
  if (!participant && chat.ticket) {
    if (chat.ticket.userId === userId) {
      return { hasAccess: true, chat, participant: null };
    }
    if (chat.ticket.organizationId) {
      const perm = await checkUserPermissions(userId);
      const orgMatch = perm.organizationId === chat.ticket.organizationId;
      const isChairmanWithAccess = perm.isChairman === true && orgMatch;
      const isStaffWithAppeals =
        perm.isStaff === true &&
        perm.permissions?.appeals_view === true &&
        orgMatch;
      if (isChairmanWithAccess || isStaffWithAppeals) {
        return { hasAccess: true, chat, participant: null };
      }
    }
  }

  return {
    hasAccess: !!participant,
    chat,
    participant,
  };
}

/**
 * Проверяет доступ и возвращает ошибку если нет доступа
 * Удобная обёртка для API routes
 * — Если чат не найден: выбрасывает ChatNotFoundError (→ 404).
 * — Если чат есть, но нет доступа: выбрасывает ChatAccessError (→ 403).
 */
export async function requireChatAccess(
  chatId: string,
  userId: string
): Promise<{ chat: any; participant: any }> {
  const { hasAccess, chat, participant } = await checkChatAccess(chatId, userId);

  if (!chat) {
    throw new ChatNotFoundError("Чат не найден");
  }

  if (!hasAccess) {
    throw new ChatAccessError("Нет доступа к этому чату");
  }

  return { chat, participant };
}

export class ChatNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatNotFoundError";
  }
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
  filter?: ChatFilter,
  bypassCache: boolean = false
): Promise<ChatInfo[]> {
  // Кэшируем списки чатов для масштабирования (TTL: 30 секунд)
  // НО: для участников обходим кэш, чтобы гарантировать актуальные данные
  const cacheKey = `user:chats:${userId}:${JSON.stringify(filter || {})}`;
  
  if (!bypassCache) {
    try {
      const cached = await cacheGet<ChatInfo[]>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      // Игнорируем ошибки кэша, продолжаем с БД
      console.warn('[chat-service] Cache read error:', error);
    }
  } else {
    console.log(`[chat-service] Bypassing cache for user ${userId}`);
  }
  // Строим условие WHERE: ID чатов — из ChatParticipant ИЛИ из чатов заседаний (MeetingParticipant)
  // Два шага вместо сложного OR по meeting, чтобы не вызывать 500 у Prisma
  const chatIdsFromParticipants = await prisma.chatParticipant.findMany({
    where: { userId, leftAt: null },
    select: { chatId: true },
  });
  const participantChatIds = [...new Set(chatIdsFromParticipants.map((p) => p.chatId))];

  const meetingParticipations = await prisma.meetingParticipant.findMany({
    where: { userId },
    select: { meetingId: true },
  });
  const meetingIds = [...new Set(meetingParticipations.map((p) => p.meetingId))];
  const meetingChatIds =
    meetingIds.length > 0
      ? (
          await prisma.chat.findMany({
            where: { meetingId: { in: meetingIds } },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [];

  const allChatIds = [...new Set([...participantChatIds, ...meetingChatIds])];
  if (allChatIds.length === 0) {
    return [];
  }

  const whereConditions: Prisma.ChatWhereInput[] = [];
  whereConditions.push({ id: { in: allChatIds } });

  // Фильтр по типу
  if (filter?.type) {
    whereConditions.push({ type: filter.type });
  }

  // Фильтр по наличию обращения (проверяем связь с Ticket через chatId)
  // Также исключаем чаты, связанные с удаленными обращениями
  if (filter?.hasTicket !== undefined) {
    // Получаем все chatId из существующих (не удаленных) тикетов
    const tickets = await prisma.ticket.findMany({
      where: { chatId: { not: null } },
      select: { chatId: true },
    });
    const ticketChatIds = tickets
      .map(t => t.chatId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    
    if (filter.hasTicket) {
      // Только чаты, которые связаны с существующими обращениями (есть Ticket с таким chatId)
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
      // Все чаты, кроме связанных с существующими обращениями
      if (ticketChatIds.length > 0) {
        whereConditions.push({
          id: { notIn: ticketChatIds },
        });
      }
    }
  }
  
  // Исключаем чаты, связанные с удаленными обращениями
  // Получаем все chatId из существующих тикетов
  const allExistingTickets = await prisma.ticket.findMany({
    where: { chatId: { not: null } },
    select: { chatId: true },
  });
  const allExistingTicketChatIds = allExistingTickets
    .map(t => t.chatId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  
  // Исключаем только чаты, которые связаны с удаленными обращениями
  // Логика: если чат имеет ticket relation, но его chatId нет в списке существующих обращений,
  // значит обращение было удалено - такой чат нужно исключить
  // НО: чаты без ticket relation (личные, каналы) должны проходить всегда
  // Поэтому условие: либо ticket null (не связан с обращением), либо chatId в списке существующих
  if (allExistingTicketChatIds.length > 0) {
    whereConditions.push({
      OR: [
        // Чат не связан с обращением (личные, каналы, обычные группы) - всегда показываем
        { ticket: null },
        // Или чат связан с существующим обращением (chatId есть в списке существующих)
        { id: { in: allExistingTicketChatIds } },
      ],
    });
  }
  // Если allExistingTicketChatIds пустой, не добавляем фильтр - показываем все чаты

  // Получаем чаты
  const chats = await prisma.chat.findMany({
    where: {
      AND: whereConditions,
    },
    include: {
      participants: {
        where: { leftAt: null },
        // ОПТИМИЗАЦИЯ: Загружаем только необходимые поля участников
        select: {
          id: true,
          userId: true,
          role: true,
          readAt: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
              // phone убран для оптимизации - используется редко
            },
          },
        },
      },
      lastMessage: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          messageType: true,
        },
      },
      newsChannel: {
        select: {
          id: true,
          name: true,
          iconUrl: true,
          organizationId: true,
          organization: {
            select: { name: true },
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
    orderBy: {
      lastMessageAt: "desc",
    },
  });

  // Получаем количество непрочитанных сообщений для всех чатов одним запросом
  let unreadCounts = new Map<string, number>();
  try {
    const chatIds = chats.map((c) => c.id);
    console.log(`[chat-service] ========== GET UNREAD COUNTS ==========`);
    console.log(`[chat-service] getUserChats: Getting unread counts for ${chatIds.length} chats`);
    console.log(`[chat-service] Chat IDs:`, chatIds);
    unreadCounts = await getUnreadCountsForChats(chatIds, userId);
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Детальное логирование для диагностики
    const totalUnread = Array.from(unreadCounts.values()).reduce((sum, count) => sum + Math.max(0, count), 0);
    const chatsWithUnread = Array.from(unreadCounts.entries()).filter(([_, count]) => count > 0);
    console.log(`[chat-service] ========== UNREAD COUNTS RESULT ==========`);
    console.log(`[chat-service] userId:`, userId);
    console.log(`[chat-service] totalChats:`, chats.length);
    console.log(`[chat-service] totalUnread:`, totalUnread);
    console.log(`[chat-service] chatsWithUnreadCount:`, chatsWithUnread.length);
    console.log(`[chat-service] chatsWithUnread:`, chatsWithUnread.map(([chatId, count]) => {
      const chat = chats.find(c => c.id === chatId);
      return {
        chatId,
        count,
        chatName: chat?.name || 'Unknown',
        chatType: chat?.type,
      };
    }));
    console.log(`[chat-service] ALL CHATS UNREAD COUNTS:`, chats.map(c => ({
      id: c.id,
      name: c.name || 'Unknown',
      type: c.type,
      unreadCount: unreadCounts.get(c.id) || 0,
    })));
    console.log(`[chat-service] ==========================================`);
  } catch (error) {
    console.error('[chat-service] ❌ Error getting unread counts:', error);
    // Продолжаем с пустым Map - все чаты будут показаны как прочитанные
  }

  // ОПТИМИЗАЦИЯ: Загружаем все тикеты одним запросом вместо N+1
  const appealChatIds = chats
    .filter(c => c.ticket === null && c.name?.includes('Обращение'))
    .map(c => c.id);
  
  let existingTicketChatIds = new Set<string>();
  if (appealChatIds.length > 0) {
    const existingTickets = await prisma.ticket.findMany({
      where: { chatId: { in: appealChatIds } },
      select: { chatId: true },
    });
    existingTicketChatIds = new Set(
      existingTickets
        .map(t => t.chatId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
  }

  // Для каналов с названием "Основной" подгружаем название ППО по organizationId (если в ответе нет organization.name)
  const orgIdsToResolve = new Set<string>();
  for (const chat of chats) {
    if (chat?.type === "CHANNEL" && chat.name === "Основной" && (chat.newsChannel as any)?.organizationId) {
      const orgName = (chat.newsChannel as any)?.organization?.name;
      if (!orgName) orgIdsToResolve.add((chat.newsChannel as any).organizationId);
    }
  }
  let orgNamesByOrgId = new Map<string, string>();
  if (orgIdsToResolve.size > 0) {
    const orgs = await prisma.organization.findMany({
      where: { id: { in: Array.from(orgIdsToResolve) } },
      select: { id: true, name: true },
    });
    orgs.forEach((o) => orgNamesByOrgId.set(o.id, o.name));
  }

  // Форматируем чаты и фильтруем чаты с удаленными обращениями
  const formattedChats: ChatInfo[] = [];
  for (const chat of chats) {
    try {
      if (!chat || !chat.id) {
        console.warn('[chat-service] Skipping invalid chat:', chat);
        continue;
      }
      
      // Дополнительная проверка: если чат имеет имя "Обращение", но ticket relation null,
      // проверяем, не было ли обращение удалено
      // ОПТИМИЗАЦИЯ: Используем предзагруженный Set вместо отдельного запроса
      if (chat.ticket === null && chat.name?.includes('Обращение')) {
        if (!existingTicketChatIds.has(chat.id)) {
          console.log(`[chat-service] Skipping chat ${chat.id} - ticket was deleted`);
          continue;
        }
      }
      // Для остальных чатов (личные, каналы, группы без обращений) - продолжаем нормально
      
      const formatted = formatChatInfo(chat, userId, unreadCounts.get(chat.id) || 0, orgNamesByOrgId);
      if (formatted) {
        formattedChats.push(formatted);
      } else {
        console.warn(`[chat-service] formatChatInfo returned null for chat ${chat.id}`);
      }
    } catch (error) {
      console.error(`[chat-service] Error formatting chat ${chat?.id || 'unknown'}:`, error);
      // Пропускаем проблемный чат, но продолжаем обработку остальных
    }
  }
  
  // Удаляем дубликаты приватных чатов с одним и тем же собеседником.
  // В базе могли остаться исторические дубли из-за гонок создания.
  const dedupedChats = dedupePrivateChatsByPeer(formattedChats);

  // Сохраняем в кэш (TTL: 30 секунд)
  try {
    await cacheSet(cacheKey, dedupedChats, 30);
  } catch (error) {
    // Игнорируем ошибки кэша
    console.warn('[chat-service] Cache write error:', error);
  }
  
  return dedupedChats;
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
      newsChannel: {
        select: {
          id: true,
          name: true,
          iconUrl: true,
          organizationId: true,
          organization: {
            select: { name: true },
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

  // Ищем существующий чат (строго: только эти 2 активных участника).
  const existingChat = await findExactPrivateChat(prisma, firstUserId, secondUserId);
  if (existingChat) {
    return { chat: existingChat, isNew: false };
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
    
    // Блокируем пару пользователей на время транзакции,
    // чтобы параллельные запросы не создали 2-3 одинаковых чата.
    const lockKey = `private-chat:${firstUserId}:${secondUserId}`;
    const txResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      // Повторная проверка после захвата блокировки (double-check).
      const found = await findExactPrivateChat(tx, firstUserId, secondUserId);
      if (found) {
        return { chat: found, isNew: false as const };
      }

      const created = await tx.chat.create({
        data: {
          type: "PRIVATE",
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
      return { chat: created, isNew: true as const };
    });
    const { chat, isNew } = txResult;
    console.log(`[chat-service] Using private chat ${chat.id}, isNew=${isNew}`);
    
    // Инвалидируем кэш для обоих пользователей
    await Promise.all([
      invalidateUserChatsCache(firstUserId),
      invalidateUserChatsCache(secondUserId),
    ]).catch(err => console.warn('[chat-service] Cache invalidation error:', err));

    return { chat, isNew };
  } catch (error: any) {
    console.error('[chat-service] Error creating chat:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack?.substring(0, 500),
    });
    throw error;
  }

  // unreachable, но нужен для полноты типов
  throw new Error("Failed to create or get private chat");
}

function isExactPrivatePair(chat: any, firstUserId: string, secondUserId: string): boolean {
  const active = (chat.participants || []).filter((p: any) => p.leftAt == null);
  if (active.length !== 2) return false;
  const ids = new Set(active.map((p: any) => p.userId));
  return ids.has(firstUserId) && ids.has(secondUserId);
}

async function findExactPrivateChat(
  client: Prisma.TransactionClient | typeof prisma,
  firstUserId: string,
  secondUserId: string
): Promise<any | null> {
  const candidates = await client.chat.findMany({
    where: {
      type: "PRIVATE",
      AND: [
        { participants: { some: { userId: firstUserId, leftAt: null } } },
        { participants: { some: { userId: secondUserId, leftAt: null } } },
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
      lastMessage: {
        select: { id: true, createdAt: true },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  return candidates.find((c) => isExactPrivatePair(c, firstUserId, secondUserId)) ?? null;
}

function dedupePrivateChatsByPeer(chats: ChatInfo[]): ChatInfo[] {
  const byPeer = new Map<string, ChatInfo>();
  const passthrough: ChatInfo[] = [];

  for (const chat of chats) {
    if (chat.type !== "PRIVATE") {
      passthrough.push(chat);
      continue;
    }

    const peerId = chat.otherUser?.id;
    // Если peer не определен, не рискуем сливать записи.
    if (!peerId) {
      passthrough.push(chat);
      continue;
    }

    const prev = byPeer.get(peerId);
    if (!prev) {
      byPeer.set(peerId, chat);
      continue;
    }

    const prevTs = prev.lastMessageAt ? new Date(prev.lastMessageAt).getTime() : new Date(prev.createdAt).getTime();
    const currTs = chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : new Date(chat.createdAt).getTime();
    if (currTs > prevTs) {
      byPeer.set(peerId, chat);
    }
  }

  return [...passthrough, ...Array.from(byPeer.values())].sort(
    (a, b) => new Date(b.lastMessageAt ?? b.createdAt).getTime() - new Date(a.lastMessageAt ?? a.createdAt).getTime()
  );
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

  // Инвалидируем кэш для всех участников
  await Promise.all(
    allParticipantIds.map(id => invalidateUserChatsCache(id))
  ).catch(err => console.warn('[chat-service] Cache invalidation error:', err));

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

  console.log(`[chat-service] markAsRead: chatId=${chatId}, userId=${userId}`);

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Для личных чатов (PRIVATE) readAt должен быть общим для всех режимов просмотра
  // Получаем информацию о чате
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { type: true },
  });

  const isPrivateChat = chat?.type === 'PRIVATE';

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Получаем текущее значение readAt перед обновлением
  const beforeParticipant = await prisma.chatParticipant.findFirst({
    where: {
      chatId,
      userId,
      leftAt: null,
    },
    select: { readAt: true },
  });

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем транзакцию для атомарного обновления
  const result = await prisma.$transaction(async (tx) => {
    // Обновляем через ChatParticipant
    const updateResult = await tx.chatParticipant.updateMany({
      where: {
        chatId,
        userId,
        leftAt: null,
      },
      data: {
        readAt: now,
      },
    });
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем что обновление произошло
    const verifyParticipant = await tx.chatParticipant.findFirst({
      where: {
        chatId,
        userId,
        leftAt: null,
      },
      select: { readAt: true },
    });
    
    if (!verifyParticipant) {
      console.error(`[chat-service] ❌ Participant not found after update for chatId=${chatId}, userId=${userId}`);
    } else if (!verifyParticipant.readAt || verifyParticipant.readAt.getTime() !== now.getTime()) {
      console.error(`[chat-service] ❌ readAt not updated correctly:`, {
        expected: now.toISOString(),
        actual: verifyParticipant.readAt?.toISOString() || null,
      });
    } else {
      console.log(`[chat-service] ✅ readAt updated correctly in transaction`);
    }
    
    return updateResult;
  });

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем что readAt действительно обновился
  const afterParticipant = await prisma.chatParticipant.findFirst({
    where: {
      chatId,
      userId,
      leftAt: null,
    },
    select: { readAt: true },
  });

  console.log(`[chat-service] markAsRead result:`, {
    chatId,
    userId,
    chatType: chat?.type,
    isPrivateChat,
    updatedCount: result.count,
    beforeReadAt: beforeParticipant?.readAt?.toISOString() || null,
    afterReadAt: afterParticipant?.readAt?.toISOString() || null,
    newReadAt: now.toISOString(),
    readAtUpdated: afterParticipant?.readAt?.getTime() === now.getTime(),
  });

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Инвалидируем кэш чатов пользователя для обновления unreadCount
  try {
    await invalidateUserChatsCache(userId);
    console.log(`[chat-service] ✅ Cache invalidated for user ${userId} after markAsRead`);
  } catch (err) {
    console.error('[chat-service] ❌ Cache invalidation error after markAsRead:', err);
  }
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

  if (!participant) {
    console.log(`[chat-service] getUnreadCount: No participant found for chatId=${chatId}, userId=${userId}`);
    return 0;
  }
  
  const lastReadAt = participant.readAt;

  // Если никогда не читал - считаем все сообщения от других
  if (!lastReadAt) {
    const count = await prisma.chatMessage.count({
      where: {
        chatId,
        senderId: { not: userId },
      },
    });
    console.log(`[chat-service] getUnreadCount: Never read, counting all messages:`, {
      chatId,
      userId,
      count,
    });
    return count;
  }

  // Считаем сообщения после последнего прочтения
  const count = await prisma.chatMessage.count({
    where: {
      chatId,
      senderId: { not: userId },
      createdAt: { gt: lastReadAt },
    },
  });
  
  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Детальное логирование для диагностики
  console.log(`[chat-service] getUnreadCount:`, {
    chatId,
    userId,
    lastReadAt: lastReadAt.toISOString(),
    unreadCount: count,
  });
  
  return count;
}

/**
 * Получает количество непрочитанных для нескольких чатов одним запросом
 * Оптимизированная версия для batch-загрузки
 * 
 * КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Для личных чатов (PRIVATE) readAt общий для всех режимов просмотра
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
  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Для личных чатов (PRIVATE) readAt уже общий для всех режимов
  const readAtMap = new Map<string, Date | null>();
  for (const p of participants) {
    readAtMap.set(p.chatId, p.readAt);
  }

  // Для чатов где readAt = null, считаем все сообщения от других
  const unreadChats = chatIds.filter(id => !readAtMap.get(id));
  if (unreadChats.length > 0) {
    try {
      const counts = await prisma.chatMessage.groupBy({
        by: ['chatId'],
        where: {
          chatId: { in: unreadChats },
          senderId: { not: userId },
        },
        _count: true,
      });
      
      for (const item of counts) {
        results.set(item.chatId, item._count);
      }
    } catch (error) {
      console.error('[chat-service] Error counting unread messages (groupBy):', error);
      // Продолжаем с нулевыми значениями
    }
  }

  // ОПТИМИЗАЦИЯ: Для чатов с readAt используем один запрос вместо N+1
  const readChats = chatIds.filter(id => readAtMap.get(id));
  if (readChats.length > 0) {
    try {
      // Группируем по chatId и readAt для одного запроса
      const readChatsData = readChats.map(chatId => ({
        chatId,
        readAt: readAtMap.get(chatId)!,
      }));

      const counts = await Promise.all(
        readChatsData.map(async ({ chatId, readAt }) => {
          try {
            const count = await prisma.chatMessage.count({
              where: {
                chatId,
                senderId: { not: userId },
                createdAt: { gt: readAt },
              },
            });
            return { chatId, count };
          } catch (error) {
            console.error(`[chat-service] Error counting unread for chat ${chatId}:`, error);
            return { chatId, count: 0 };
          }
        })
      );

      for (const { chatId, count } of counts) {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убеждаемся что count не отрицательный
        results.set(chatId, Math.max(0, count));
      }
    } catch (error) {
      console.error('[chat-service] Error counting unread messages (batch):', error);
      // Продолжаем с нулевыми значениями
    }
  }

  return results;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Форматирует данные чата для API ответа
 * @param orgNamesByOrgId — подгруженные названия организаций (ППО) для каналов с именем "Основной"
 */
export function formatChatInfo(
  chat: any,
  currentUserId: string,
  unreadCount: number,
  orgNamesByOrgId?: Map<string, string>
): ChatInfo | null {
  if (!chat || !chat.id) {
    console.error('[chat-service] formatChatInfo: invalid chat object', chat);
    return null;
  }
  
  // Логируем archivedAt для отладки
  if (chat.archivedAt) {
    console.log(`[chat-service] 📦 Chat ${chat.id} (${chat.name || 'no name'}) is archived at:`, chat.archivedAt);
  }
  
  const isGroup = chat.type === "GROUP";
  const isChannel = chat.type === "CHANNEL";
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

  if (isChannel) {
    // Название канала = название ППО (организации). Для каналов "Основной" подставляем имя организации
    const orgId = (chat.newsChannel as any)?.organizationId;
    const resolvedOrgName = orgId && orgNamesByOrgId?.get(orgId);
    const rawName =
      resolvedOrgName ||
      (chat.newsChannel as any)?.organization?.name ||
      chat.newsChannel?.name ||
      chat.name ||
      "Канал";
    displayName = rawName === "Основной" ? (resolvedOrgName || (chat.newsChannel as any)?.organization?.name || "Канал организации") : rawName;
    displayAvatar = chat.newsChannel?.iconUrl || chat.iconUrl || null;
    otherUser = {
      id: chat.id,
      firstName: null,
      lastName: displayName,
      middleName: null,
      avatarUrl: displayAvatar,
      isGroup: true,
      participantsCount,
    };
  } else if (isGroup) {
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
  } else if (otherParticipant && (otherParticipant.userId == null || otherParticipant.user == null)) {
    // Удалённый пользователь: участник есть, но user обнулён
    const label = otherParticipant.deletedUserDisplayName ?? "Удалённый пользователь";
    displayName = label;
    displayAvatar = null;
    otherUser = {
      id: "deleted",
      firstName: null,
      lastName: label,
      middleName: null,
      avatarUrl: null,
      isDeleted: true,
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

  // Форматируем участников (удалённый пользователь: user = null, deletedUserDisplayName задан)
  const participants: ParticipantInfo[] = (chat.participants || []).map((p: any) => ({
    id: p.id,
    odvisId: p.id,
    userId: p.userId,
    role: p.role as ParticipantRole,
    readAt: p.readAt,
    joinedAt: p.joinedAt,
    user: p.user ? normalizeUserAvatar(p.user) : null,
    deletedUserDisplayName: p.deletedUserDisplayName ?? (p.user ? null : "Удалённый пользователь"),
  }));

  // Получаем последнее сообщение из relation
  let lastMessage: string | null = null;
  if (chat.lastMessage) {
    const msg = chat.lastMessage as { content?: string; messageType?: string };
    const messageType = msg.messageType;

    // Специальные типы: не показываем сырой JSON/HTML в превью
    if (messageType === 'channel_post') {
      lastMessage = '📢 Пост в канале';
    } else if (messageType === 'assistant') {
      lastMessage = '💬 Ответ ИИ-ассистента';
    } else if (typeof msg === 'object' && 'content' in msg && msg.content) {
      let raw = msg.content;
      // Не показываем сырой JSON или HTML в превью
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') && (trimmed.includes('"type"') || trimmed.includes('"postId"'))) {
        lastMessage = '📢 Пост в канале';
      } else if (trimmed.startsWith('<') && trimmed.includes('>')) {
        lastMessage = 'Сообщение';
      } else {
        lastMessage = raw;
        // Очищаем markdown разметку из preview
        lastMessage = lastMessage
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/#{1,6}\s+/g, '')
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/\n{2,}/g, ' ')
          .trim();
        if (lastMessage.length > 100) {
          lastMessage = lastMessage.substring(0, 100) + '...';
        }
      }
    } else if (typeof chat.lastMessage === 'string') {
      const raw = chat.lastMessage;
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') && (trimmed.includes('"type"') || trimmed.includes('"postId"'))) {
        lastMessage = '📢 Пост в канале';
      } else if (trimmed.startsWith('<') && trimmed.includes('>')) {
        lastMessage = 'Сообщение';
      } else {
        lastMessage = raw
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/#{1,6}\s+/g, '')
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/\n{2,}/g, ' ')
          .trim();
        if (lastMessage.length > 100) {
          lastMessage = lastMessage.substring(0, 100) + '...';
        }
      }
    }
  }

  // Получаем данные об обращении, если чат связан с обращением
  const ticket = chat.ticket;
  const ticketId = ticket?.id || null;
  const ticketPublicId = ticket?.publicId || null;
  const ticketTitle = ticket?.title || null;

  return {
    id: chat.id,
    type: chat.type as ChatType,
    name: chat.name,
    description: chat.description,
    iconUrl: chat.iconUrl,
    isPublic: chat.isPublic ?? true,
    lastMessage: lastMessage,
    lastMessageAt: chat.lastMessageAt,
    unreadCount,
    createdAt: chat.createdAt,
    archivedAt: chat.archivedAt ?? null,
    displayName,
    displayAvatar,
    participants,
    participantsCount: chat._count?.participants || participants.length,
    ticketId,
    ticketPublicId,
    ticketTitle,
    meetingId: chat.meetingId ?? null,
    newsChannelOrganizationId: chat.type === "CHANNEL" ? (chat.newsChannel?.organizationId ?? null) : null,
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

  // Инвалидируем кэш чата
  await invalidateChatCache(chatId).catch(err => 
    console.warn('[chat-service] Cache invalidation error:', err)
  );
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

