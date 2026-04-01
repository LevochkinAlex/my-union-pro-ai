import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import {
  getUserChats,
  getOrCreatePrivateChat,
  getChatById,
  ChatFilter,
  formatChatInfo,
} from "@/lib/chat-service";
import { ensureMeetingGroupChat } from "@/lib/meeting-chat";
import { getSupportUserId, getSupportEmail } from "@/lib/support-user";
import { sendUserNotification } from "@/lib/notifications";
import { invalidateChatCache, invalidateUserChatsCache } from "@/lib/chat-redis";
import { withCache, getCacheKey } from "@/lib/cache";
import { REGIONAL_NEWS_CHANNEL_NAME } from "@/lib/regional-news";
import * as Sentry from "@sentry/nextjs";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { getDemoMemberChats, getDemoChairmanChats } from "@/lib/demo";
import { getRequestUserId } from "@/lib/api-request-user";

const AI_CHAT_NAME = "ИИ-Ассистент";
const AI_BOT_ID = "ai-assistant-bot";
const SUPPORT_CHAT_DISPLAY_NAME = "Техподдержка";

function isAnyAIChat(chat: any): boolean {
  if (!chat) return false;
  if (chat.isAIChat === true) return true;

  const name = String(chat.displayName || chat.name || "").toLowerCase();
  const aiPatterns = [
    "ии-ассистент",
    "ии ассистент",
    "ai assistant",
    "ai-assistant",
    "помощник ai",
    "ai помощник",
    "мойсоюз помощник",
  ];

  if (aiPatterns.some((p) => name.includes(p))) return true;

  const ou = chat.otherUser;
  if (!ou) return false;
  if (ou.id === AI_BOT_ID) return true;

  const firstName = String(ou.firstName || "").toLowerCase();
  const lastName = String(ou.lastName || "").toLowerCase();
  if ((firstName === "ai" && lastName.includes("помощник")) || (firstName === "ии" && lastName.includes("ассистент"))) {
    return true;
  }

  return false;
}

/**
 * Получает или создает чат с ИИ-ассистентом (экспорт для /api/chat/rooms)
 */
export async function getOrCreateAIChat(userId: string) {
  // Ищем существующий чат с ИИ
  let aiChat = await prisma.chat.findFirst({
    where: {
      type: "PRIVATE",
      name: AI_CHAT_NAME,
      participants: {
        some: {
          userId: userId,
          leftAt: null,
        },
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
      lastMessage: {
        select: {
          content: true,
          createdAt: true,
        },
      },
      _count: {
        select: { messages: true, participants: true },
      },
    },
  });

  // Если чата нет, создаём его
  if (!aiChat) {
    aiChat = await prisma.chat.create({
      data: {
        type: "PRIVATE",
        name: AI_CHAT_NAME,
        description: "Персональный ИИ-помощник по профсоюзным вопросам",
        isPublic: false,
        participants: {
          create: [
            {
              userId: userId,
              role: "member",
            },
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
        lastMessage: {
          select: {
            content: true,
            createdAt: true,
          },
        },
        _count: {
          select: { messages: true, participants: true },
        },
      },
    });
  }

  return aiChat;
}

/**
 * Форматирует ИИ чат для ответа API
 */
function formatAIChat(aiChat: any, userId: string) {
  return {
    id: aiChat.id,
    type: "PRIVATE" as const,
    name: AI_CHAT_NAME,
    description: aiChat.description,
    displayName: AI_CHAT_NAME,
    displayAvatar: null,
    iconUrl: null,
    isPublic: false,
    lastMessage: aiChat.lastMessage?.content || null,
    lastMessageAt: aiChat.lastMessage?.createdAt || aiChat.createdAt,
    unreadCount: 0,
    createdAt: aiChat.createdAt,
    otherUser: {
      id: AI_BOT_ID,
      firstName: "ИИ",
      lastName: "Ассистент",
      middleName: null,
      avatarUrl: null,
      isBot: true,
    },
    participants: aiChat.participants.map((p: any) => ({
      id: p.id,
      odvisId: p.id,
      userId: p.userId,
      role: p.role,
      readAt: p.readAt,
      joinedAt: p.joinedAt,
      user: p.user,
    })),
    participantsCount: aiChat._count?.participants || 1,
    ticketId: null,
    ticketPublicId: null,
    ticketTitle: null,
    isAIChat: true,
  };
}

/**
 * Возвращает существующий чат с техподдержкой (без автосоздания).
 * ВАЖНО: чат должен появляться только после первого сообщения пользователя.
 */
async function getExistingSupportChat(userId: string) {
  const supportUserId = await getSupportUserId();
  if (!supportUserId) return null;

  const existingChat = await prisma.chat.findFirst({
    where: {
      type: "PRIVATE",
      participants: {
        some: { userId, leftAt: null },
      },
      AND: [
        {
          participants: {
            some: { userId: supportUserId, leftAt: null },
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
      lastMessage: { select: { content: true, createdAt: true, messageType: true } },
      _count: { select: { participants: true, messages: true } },
    },
  });

  return existingChat;
}

/**
 * Форматирует чат техподдержки для ответа API (как отдельный пункт под ИИ)
 */
function formatSupportChat(supportChat: any, userId: string) {
  const supportUserId = supportChat.participants?.find((p: any) => p.userId !== userId)?.userId;
  const supportUser = supportChat.participants?.find((p: any) => p.userId === supportUserId)?.user;
  return {
    id: supportChat.id,
    type: "PRIVATE" as const,
    name: SUPPORT_CHAT_DISPLAY_NAME,
    description: "Чат с техподдержкой МойСоюз",
    displayName: SUPPORT_CHAT_DISPLAY_NAME,
    displayAvatar: supportUser?.avatarUrl ?? null,
    iconUrl: null,
    isPublic: false,
    lastMessage: supportChat.lastMessage?.content ?? null,
    lastMessageAt: supportChat.lastMessage?.createdAt ?? supportChat.createdAt,
    unreadCount: 0,
    createdAt: supportChat.createdAt,
    otherUser: supportUser
      ? {
          id: supportUser.id,
          firstName: supportUser.firstName ?? "Техподдержка",
          lastName: supportUser.lastName ?? "МойСоюз",
          middleName: supportUser.middleName ?? null,
          avatarUrl: supportUser.avatarUrl ?? null,
        }
      : {
          id: supportUserId ?? "support",
          firstName: "Техподдержка",
          lastName: "МойСоюз",
          middleName: null,
          avatarUrl: null,
        },
    participants: supportChat.participants ?? [],
    participantsCount: supportChat._count?.participants ?? 2,
    ticketId: null,
    ticketPublicId: null,
    ticketTitle: null,
    isSupportChat: true,
  };
}

/**
 * GET /api/chat
 * Получить список чатов пользователя
 */
export async function GET(request: NextRequest) {
  let requestUser: { id: string } | null = null;
  let filter: ChatFilter = {};
  try {
    requestUser = await getRequestUserId(request);
    if (!requestUser) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = requestUser.id;
    const { searchParams } = new URL(request.url);
    const bypassCache = searchParams.get("bypassCache") === "1";

    // Демо-режим: мок-чаты без БД
    if (userId === DEMO_MEMBER_USER_ID) {
      return NextResponse.json({ chats: getDemoMemberChats() });
    }
    if (userId === DEMO_USER_ID) {
      return NextResponse.json({ chats: getDemoChairmanChats() });
    }

    // Получаем viewMode пользователя для фильтрации чатов
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        viewMode: true,
        isPPOHead: true,
        ppoHeadOrganizationId: true,
        isMPOHead: true,
        mpoHeadOrganizationId: true,
        isRPOHead: true,
        rpoHeadOrganizationId: true,
        organizationId: true,
      },
    });

    const isMemberMode = user?.viewMode === "MEMBER";
    const currentOrgId =
      user?.viewMode === "RPO_HEAD"
        ? user.rpoHeadOrganizationId ?? null
        : user?.viewMode === "MPO_HEAD"
          ? user.mpoHeadOrganizationId ?? null
          : user?.viewMode === "PPO_HEAD"
            ? user.ppoHeadOrganizationId ?? null
            : user?.organizationId ?? null;
    const isPPOHeadMode = user?.viewMode === "PPO_HEAD" || 
      (user?.isPPOHead && !user?.viewMode) || // Обратная совместимость
      (user?.isMPOHead && !user?.viewMode) ||
      (user?.isRPOHead && !user?.viewMode);

    // Самовосстановление подписки на каналы:
    // если пользователь выпал из участников channel-чата (исторические данные/миграции),
    // возвращаем его в каналы своей организации и в региональный канал.
    try {
      const channelChats = await prisma.chat.findMany({
        where: {
          type: "CHANNEL",
          newsChannel: {
            OR: [
              { organizationId: currentOrgId },
              { organizationId: null, name: REGIONAL_NEWS_CHANNEL_NAME },
            ],
          },
        },
        select: { id: true },
      });

      for (const ch of channelChats) {
        const existingParticipant = await prisma.chatParticipant.findUnique({
          where: {
            chatId_userId: {
              chatId: ch.id,
              userId,
            },
          },
          select: { id: true, leftAt: true },
        });

        if (!existingParticipant) {
          await prisma.chatParticipant.create({
            data: {
              chatId: ch.id,
              userId,
              role: "member",
            },
          }).catch(() => {});
        } else if (existingParticipant.leftAt) {
          await prisma.chatParticipant.update({
            where: {
              chatId_userId: {
                chatId: ch.id,
                userId,
              },
            },
            data: {
              leftAt: null,
              role: "member",
            },
          }).catch(() => {});
        }
      }
    } catch (repairErr) {
      console.warn("[chat] channel membership self-heal warning:", repairErr);
    }
    
    // ВАЖНО: Для участников всегда инвалидируем кэш, чтобы получить актуальные данные
    // Это гарантирует, что личные чаты будут видны после переключения режима
    if (isMemberMode) {
      try {
        // Инвалидируем все варианты кэша для этого пользователя через Redis
        await invalidateUserChatsCache(userId).catch(err => 
          console.warn('[chat] Redis cache invalidation error for MEMBER mode:', err)
        );
        
        // Также инвалидируем кэш через общий cache.ts (на случай если используется другой механизм)
        const { cacheDeletePattern } = await import('@/lib/cache');
        await cacheDeletePattern(`user:chats:${userId}:*`).catch(err => 
          console.warn('[chat] Cache pattern deletion error:', err)
        );
        
        console.log(`[chat] Cache invalidated for MEMBER mode user ${userId}`);
      } catch (err) {
        // Игнорируем ошибки инвалидации кэша, но логируем
        console.warn('[chat] Cache invalidation error:', err);
      }
    }

    // Получаем параметры фильтрации
    filter = {};
    
    const typeParam = searchParams.get("type");
    if (typeParam === "PRIVATE" || typeParam === "GROUP") {
      filter.type = typeParam;
    }

    const hasTicketParam = searchParams.get("hasTicket");
    if (hasTicketParam === "true") {
      filter.hasTicket = true;
    } else if (hasTicketParam === "false") {
      filter.hasTicket = false;
    }

    const includeAI = searchParams.get("includeAI") !== "false"; // По умолчанию включаем ИИ

    // Автоматическая синхронизация каналов для председателей
    // Проверяем, является ли пользователь председателем и есть ли у него каналы без Chat
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          isPPOHead: true,
          ppoHeadOrganizationId: true,
          isMPOHead: true,
          mpoHeadOrganizationId: true,
          isRPOHead: true,
          rpoHeadOrganizationId: true,
        },
      });

      if (user && (user.isPPOHead || user.isMPOHead || user.isRPOHead)) {
        const organizationId = user.ppoHeadOrganizationId || user.mpoHeadOrganizationId || user.rpoHeadOrganizationId;
        if (organizationId) {
          const { syncAllOrganizationChannels, syncRpoHeadChannels } = await import("@/lib/channel-sync");
          if (user.isRPOHead && user.rpoHeadOrganizationId) {
            syncRpoHeadChannels(userId, user.rpoHeadOrganizationId).catch((error) => {
              console.warn("[chat] RPO channel sync error:", error);
            });
          } else {
            syncAllOrganizationChannels(organizationId).catch((error) => {
              console.warn("[chat] Background channel sync error:", error);
            });
          }
        }
      }
    } catch (syncError) {
      // Игнорируем ошибки синхронизации, не блокируем загрузку чатов
      console.warn("[chat] Channel sync check error:", syncError);
    }

    // Синхронизация чатов заседаний:
    // 1) Для председателя: создаём групповые чаты заседаний организации, если их ещё нет.
    // 2) Для любого пользователя: заседания, где он участник — ensureMeetingGroupChat добавляет его в чат, если его там ещё нет.
    let didSyncMeetingChats = false;
    try {
      if (isPPOHeadMode && user) {
        const organizationId = user.ppoHeadOrganizationId || user.mpoHeadOrganizationId || user.rpoHeadOrganizationId;
        if (organizationId) {
          const meetingsWithoutChat = await prisma.meeting.findMany({
            where: {
              organizationId,
              groupChat: null,
              participants: { some: { userId: { not: null } } },
            },
            select: { id: true },
          });
          for (const meeting of meetingsWithoutChat) {
            await ensureMeetingGroupChat(meeting.id).catch((err) =>
              console.warn("[chat] ensureMeetingGroupChat:", meeting.id, err)
            );
          }
          if (meetingsWithoutChat.length > 0) {
            didSyncMeetingChats = true;
          }
        }
      }
      // Участник заседаний (зам., член профкома и т.д.): синхронизируем чаты заседаний, где он участвует (создаём чат при отсутствии, добавляем в участники при наличии)
      const meetingsWhereUserParticipant = await prisma.meeting.findMany({
        where: {
          participants: { some: { userId } },
        },
        select: { id: true },
      });
      for (const meeting of meetingsWhereUserParticipant) {
        const result = await ensureMeetingGroupChat(meeting.id).catch((err) => {
          console.warn("[chat] ensureMeetingGroupChat participant sync:", meeting.id, err);
          return null;
        });
        if (result) didSyncMeetingChats = true;
      }
      if (didSyncMeetingChats) {
        await invalidateUserChatsCache(userId).catch(() => {});
      }
    } catch (syncErr) {
      console.warn("[chat] Meeting group chat sync error:", syncErr);
    }

    // Кешируем список чатов на короткое время (15 сек)
    let chats: any[] = [];
    try {
      const cacheKey = getCacheKey(`user:chats:${userId}`, filter);
      const bypassCacheForRequest = didSyncMeetingChats || bypassCache;
      
      const result = await Sentry.startSpan(
        {
          op: "db.query",
          name: "GET /api/chat - getUserChats",
        },
        async (span) => {
          span.setAttribute("userId", userId);
          span.setAttribute("filter", JSON.stringify(filter));
          span.setAttribute("isMemberMode", isMemberMode);
          
          // Для участников не используем кэш, чтобы гарантировать актуальные данные
          if (isMemberMode) {
            console.log(`[chat] MEMBER mode: bypassing cache, fetching directly from DB`);
            return await getUserChats(userId, filter, true); // bypassCache = true
          }
          
          // После синхронизации чатов заседаний или при явном bypassCache (вкладка «Архив») обходим кэш
          if (bypassCacheForRequest) {
            return await getUserChats(userId, filter, true);
          }
          
          try {
            return await withCache(cacheKey, async () => {
              return await getUserChats(userId, filter);
            }, 15);
          } catch (cacheError) {
            console.error("[chat] Cache error, trying direct call:", cacheError);
            // Если кеш не работает, пробуем напрямую
            return await getUserChats(userId, filter);
          }
        }
      );
      
      // Убеждаемся, что результат - массив
      if (Array.isArray(result)) {
        chats = result;
      } else {
        console.error("[chat] getUserChats returned non-array:", typeof result, result);
        chats = [];
      }
    } catch (dbError: any) {
      console.error("[chat] Database query error:", dbError);
      console.error("[chat] Error stack:", dbError?.stack);
      // Если запрос к БД не удался, возвращаем пустой массив
      chats = [];
    }

    // Фильтруем ИИ и чат техподдержки из основного списка (добавляются отдельно в начало)
    const supportUserId = await getSupportUserId().catch(() => null);
    let filteredChats = Array.isArray(chats) ? chats.filter((c: any) => {
      if (!c) return false;
      if (isAnyAIChat(c)) return false;
      if (supportUserId && c.otherUser?.id === supportUserId) return false;
      return true;
    }) : [];

    // В режиме участника (MEMBER) фильтруем чаты:
    // - Только личные чаты (PRIVATE)
    // - Свои обращения (где userId === session.user.id)
    // - Каналы (CHANNEL): для обычного участника — каналы своей ППО + региональный;
    //   для участника-РПО (председатель переключился в режим участника) — только канал «Региональные новости».
    if (isMemberMode) {
      const isRPOUser = user?.isRPOHead === true && user?.rpoHeadOrganizationId != null;

      // Получаем ID своих обращений
      const userTickets = await prisma.ticket.findMany({
        where: { userId },
        select: { chatId: true },
      });
      const userTicketChatIds = userTickets
        .map(t => t.chatId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      filteredChats = filteredChats.filter((chat: any) => {
        if (!chat || !chat.id) return false;
        if (chat.type === "PRIVATE") return true;
        if (chat.ticketId && userTicketChatIds.includes(chat.id)) return true;
        if (chat.type === "CHANNEL") {
          const channelOrgId = chat.newsChannelOrganizationId ?? null;
          const channelName = String(chat.displayName || chat.name || "");
          // Участник-РПО видит только один канал — «Региональные новости» (свой региональный).
          if (isRPOUser) {
            return channelOrgId === null && channelName === REGIONAL_NEWS_CHANNEL_NAME;
          }
          // Обычный участник: каналы без organizationId — только глобальный региональный; с orgId — только своей ППО.
          if (channelOrgId === null) {
            return channelName === REGIONAL_NEWS_CHANNEL_NAME;
          }
          return currentOrgId != null && channelOrgId === currentOrgId;
        }
        // В режиме участника не показываем чаты заседаний (GROUP+meetingId) — они доступны только в режиме «Сотрудник»/председатель
        if (chat.type === "GROUP" && chat.meetingId) return false;
        return false;
      });
    } else if (currentOrgId != null) {
      const isRPO = user?.viewMode === "RPO_HEAD" && user?.rpoHeadOrganizationId != null;
      let scopeOrgIds: string[] | null = null;
      if (isRPO) {
        const { getOrgHeadScope } = await import("@/lib/org-head-permissions");
        const scope = await getOrgHeadScope(userId);
        scopeOrgIds = scope?.organizationIds ?? null;
      }
      filteredChats = filteredChats.filter((chat: any) => {
        if (!chat || chat.type !== "CHANNEL") return true;
        const channelOrgId = chat.newsChannelOrganizationId ?? null;
        const channelName = String(chat.displayName || chat.name || "");
        // Для channels без organizationId показываем только глобальный региональный канал.
        if (channelOrgId === null) return channelName === REGIONAL_NEWS_CHANNEL_NAME;
        if (isRPO && scopeOrgIds && scopeOrgIds.length > 0) {
          const childOrgIds = scopeOrgIds.filter((id) => id !== user.rpoHeadOrganizationId);
          return childOrgIds.includes(channelOrgId);
        }
        return channelOrgId === currentOrgId;
      });
    }

    // Fallback: принудительно добавляем каналы организации + региональный канал в выдачу,
    // даже если они временно выпали из основного списка (исторические расхождения/кэш).
    try {
      const shouldIncludeOrgChannels =
        currentOrgId != null && !(user?.viewMode === "RPO_HEAD" && user?.rpoHeadOrganizationId != null);
      if (shouldIncludeOrgChannels) {
        const fallbackChannelChats = await prisma.chat.findMany({
          where: {
            type: "CHANNEL",
            newsChannel: {
              OR: [
                { organizationId: currentOrgId },
                { organizationId: null, name: REGIONAL_NEWS_CHANNEL_NAME },
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
                organization: { select: { name: true } },
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
            createdAt: "asc",
          },
        });

        const existingIds = new Set(filteredChats.map((c: any) => c.id));
        for (const channelChat of fallbackChannelChats) {
          if (existingIds.has(channelChat.id)) continue;
          const formatted = formatChatInfo(channelChat, userId, 0);
          if (formatted) {
            filteredChats.push(formatted as any);
            existingIds.add(channelChat.id);
          }
        }
      }
    } catch (fallbackErr) {
      console.warn("[chat] channel fallback merge warning:", fallbackErr);
    }

    // Добавляем ИИ чат и чат техподдержки в начало списка
    let finalChats = filteredChats;
    if (includeAI && !filter.hasTicket) {
      const head: any[] = [];
      try {
        const aiChat = await getOrCreateAIChat(userId);
        if (aiChat) head.push(formatAIChat(aiChat, userId));
      } catch (aiError) {
        console.error("[chat] Error loading AI chat:", aiError);
      }
      try {
        const supportChat = await getExistingSupportChat(userId);
        if (supportChat) head.push(formatSupportChat(supportChat, userId));
      } catch (supportError) {
        console.error("[chat] Error loading support chat:", supportError);
      }
      if (head.length) finalChats = [...head, ...filteredChats];
    }

    // Гарантия одного ИИ-чата в списке: оставляем только первый попавшийся AI-чат
    let seenOneAiChat = false;
    finalChats = (finalChats || []).filter((c: any) => {
      if (!isAnyAIChat(c)) return true;
      if (seenOneAiChat) return false;
      seenOneAiChat = true;
      return true;
    });

    // РПО: только канал «Региональные новости» (orgId === null) — для публикации, остальные каналы — только просмотр
    if (user?.isRPOHead && user?.rpoHeadOrganizationId) {
      finalChats = finalChats.map((c: any) => ({
        ...c,
        canPost: c.type === "CHANNEL" ? c.newsChannelOrganizationId === null : undefined,
      }));
    }

    return NextResponse.json({
      chats: finalChats || [],
      supportUserId: supportUserId ?? null,
    });
  } catch (error: any) {
    console.error("[chat] GET Error:", error);
    Sentry.captureException(error, {
      tags: { endpoint: 'GET /api/chat' },
      extra: { userId: requestUser?.id, filter },
    });
    // Всегда возвращаем 200 с массивом чатов, чтобы не ломать UI («Не удалось загрузить чаты»)
    return NextResponse.json({
      chats: [],
      error: "Ошибка при загрузке чатов",
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
}

/**
 * POST /api/chat
 * Создать новый чат
 */
export async function POST(request: NextRequest) {
  let session: any = null;
  try {
    session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { targetUserId, participantIds, name, description, iconUrl, type } = body;

    let chat;
    let isNew = false;

    // Создаем личный чат (только с пользователями своего ППО; исключение — ИИ-помощник)
    if (targetUserId) {
      const [me, target] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } }),
        prisma.user.findUnique({ where: { id: targetUserId }, select: { organizationId: true, email: true } }),
      ]);
      const isAIBot = target?.email === "ai-assistant@myunion.pro";
      const supportEmail = getSupportEmail().toLowerCase();
      const isSupportAccount =
        !!target?.email && target.email.toLowerCase() === supportEmail;
      if (isAIBot) {
        // Для ИИ всегда используем единый каноничный чат "ИИ-Ассистент",
        // чтобы не создавать отдельные приватные "ветки" с ботом.
        chat = await getOrCreateAIChat(userId);
        isNew = false;
      } else if (isSupportAccount) {
        // Техподдержка — общий аккаунт без привязки к ППО; не сравниваем organizationId.
        const result = await getOrCreatePrivateChat(userId, targetUserId);
        chat = result.chat;
        isNew = result.isNew;
      } else {
        const myOrg = me?.organizationId ?? null;
        const targetOrg = target?.organizationId ?? null;
        if (myOrg !== targetOrg) {
          return NextResponse.json(
            { error: "Чат доступен только с участниками вашей первичной профсоюзной организации (ППО). Пользователь из другого ППО." },
            { status: 403 }
          );
        }
        const result = await getOrCreatePrivateChat(userId, targetUserId);
        chat = result.chat;
        isNew = result.isNew;
      }
    } 
    // Создаем групповой чат
    else if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
      // Проверяем viewMode пользователя - только председатели могут создавать группы и каналы
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          viewMode: true,
          isPPOHead: true,
          isMPOHead: true,
          isRPOHead: true,
        },
      });

      const isMemberMode = user?.viewMode === "MEMBER";
      const isPPOHeadMode = user?.viewMode === "PPO_HEAD" || 
        (user?.isPPOHead && !user?.viewMode) || // Обратная совместимость
        (user?.isMPOHead && !user?.viewMode) ||
        (user?.isRPOHead && !user?.viewMode);

      if (isMemberMode) {
        return NextResponse.json(
          { error: "В режиме участника нельзя создавать группы и каналы. Переключитесь в режим председателя." },
          { status: 403 }
        );
      }

      console.log('[chat] Creating group chat:', { 
        name, 
        participantIds: participantIds.length, 
        participantIdsList: participantIds,
        userId,
        description,
        iconUrl 
      });
      
      // Проверяем, нет ли уже такого группового чата с теми же участниками
      const existingChat = await prisma.chat.findFirst({
        where: {
          type: 'GROUP',
          name: name || null,
          participants: {
            every: {
              userId: { in: [userId, ...participantIds] },
              leftAt: null,
            },
          },
        },
        include: {
          participants: {
            where: { leftAt: null },
          },
        },
      });

      if (existingChat && existingChat.participants.length === participantIds.length + 1) {
        console.log('[chat] Existing group chat found:', existingChat.id);
        chat = existingChat;
        isNew = false;
      } else {
        // Создаем новый групповой чат или канал
        const chatType = type === 'CHANNEL' ? 'CHANNEL' : 'GROUP';
        const defaultName = chatType === 'CHANNEL' ? 'Канал' : 'Групповой чат';
        console.log(`[chat] Creating new ${chatType} chat with participants:`, participantIds);
        try {
          // Для канала создаем также NewsChannel
          let newsChannelId: string | undefined;
          if (chatType === 'CHANNEL') {
            // Получаем организацию пользователя
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { organizationId: true },
            });
            const normalizedChannelName = (name || defaultName).trim();
            if (!normalizedChannelName) {
              return NextResponse.json(
                { error: "Название канала обязательно" },
                { status: 400 }
              );
            }

            // Не даём создавать дубли каналов с одинаковым названием в одной организации
            const duplicateNewsChannel = await prisma.newsChannel.findFirst({
              where: {
                organizationId: user?.organizationId || null,
                name: {
                  equals: normalizedChannelName,
                  mode: "insensitive",
                },
              },
              select: { id: true },
            });
            if (duplicateNewsChannel) {
              return NextResponse.json(
                { error: "Канал с таким названием уже существует" },
                { status: 400 }
              );
            }
            
            const newsChannel = await prisma.newsChannel.create({
              data: {
                name: normalizedChannelName,
                description: description?.trim() || null,
                iconUrl: iconUrl || null,
                organizationId: user?.organizationId || null,
                createdById: userId,
                isMain: false, // Дефолтный канал создается отдельно
              },
            });
            newsChannelId = newsChannel.id;
          }

          chat = await prisma.chat.create({
            data: {
              type: chatType,
              name: name || defaultName,
              description: description?.trim() || null,
              iconUrl: iconUrl || null,
              createdById: userId,
              newsChannelId: newsChannelId,
              participants: {
                create: [
                  { userId, role: 'admin' },
                  ...participantIds.map((id: string) => ({ userId: id, role: 'member' })),
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
                    avatarUrl: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });
        console.log('[chat] ✅ Group chat created successfully:', chat.id);
        isNew = true;
        } catch (createError: any) {
          console.error('[chat] ❌ Error creating group chat:', createError);
          console.error('[chat] Error details:', {
            message: createError?.message,
            code: createError?.code,
            meta: createError?.meta,
          });
          throw createError;
        }

        // Инвалидируем кэш для всех участников
        const allParticipantIds = [userId, ...participantIds];
        await Promise.allSettled([
          invalidateChatCache(chat.id),
          ...allParticipantIds.map(id => invalidateUserChatsCache(id)),
        ]).catch(err => console.warn('[chat] Cache invalidation error:', err));

        // Отправляем уведомления добавленным участникам
        if (participantIds.length > 0) {
          const creatorName = chat.createdBy 
            ? `${chat.createdBy.firstName || ''} ${chat.createdBy.lastName || ''}`.trim() || 'Пользователь'
            : 'Пользователь';
          const chatName = chat.name || 'группу';
          const notificationUrl = `/dashboard/chat?chatId=${chat.id}`;

          await Promise.allSettled(
            participantIds.map(async (participantId: string) => {
              try {
                await sendUserNotification({
                  userId: participantId,
                  type: 'chat_message',
                  title: '👥 Вас добавили в группу',
                  body: `${creatorName} добавил вас в "${chatName}"`,
                  url: notificationUrl,
                  senderName: creatorName,
                });
              } catch (err) {
                console.error(`[chat] Error sending notification to user ${participantId}:`, err);
              }
            })
          );
        }
      }
    } else {
      console.error('[chat] Missing required fields:', { targetUserId, participantIds });
      return NextResponse.json(
        { error: "Необходимо указать targetUserId или participantIds" },
        { status: 400 }
      );
    }

    if (!chat) {
      console.error('[chat] Chat creation failed - chat is null');
      return NextResponse.json(
        { error: "Не удалось создать чат" },
        { status: 500 }
      );
    }

    // Для приватного чата нужно загрузить полную информацию через formatChatInfo
    if (chat.type === 'PRIVATE') {
      try {
        const formattedChat = await getChatById(chat.id, userId);
        if (formattedChat) {
          return NextResponse.json({
            chat: formattedChat,
            isNew,
          });
        }
      } catch (formatError) {
        console.error('[chat] Error formatting private chat:', formatError);
        // Продолжаем с базовым форматом
      }
    }

    // Получаем информацию о другом пользователе для личного чата (в т.ч. удалённый пользователь)
    let otherUser: { id: string; firstName: string | null; lastName: string | null; middleName?: string | null; avatarUrl?: string | null; phone?: string | null; isDeleted?: boolean } | null = null;
    if (chat.type === 'PRIVATE' && chat.participants) {
      const otherParticipant = chat.participants.find((p: any) => p.userId !== userId);
      if (otherParticipant?.user) {
        otherUser = normalizeUserAvatar(otherParticipant.user);
      } else if (otherParticipant && (otherParticipant.userId == null || !otherParticipant.user)) {
        const label = otherParticipant.deletedUserDisplayName ?? "Удалённый пользователь";
        otherUser = {
          id: "deleted",
          firstName: null,
          lastName: label,
          middleName: null,
          avatarUrl: null,
          phone: null,
          isDeleted: true,
        };
      }
    }

    return NextResponse.json({
      chat: {
        id: chat.id,
        type: chat.type,
        name: chat.name,
        description: chat.description,
        iconUrl: chat.iconUrl,
        isNew,
        otherUser: otherUser ? {
          id: otherUser.id,
          firstName: otherUser.firstName,
          lastName: otherUser.lastName,
          middleName: otherUser.middleName,
          avatarUrl: otherUser.avatarUrl,
          phone: otherUser.phone,
          isDeleted: otherUser.isDeleted,
        } : null,
      },
    });
  } catch (error: any) {
    console.error("[chat] POST Error:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack?.substring(0, 500),
    });
    
    // Более детальная обработка ошибок Prisma
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: "Чат с таким названием уже существует" },
        { status: 409 }
      );
    }
    
    if (error?.code === 'P2003') {
      return NextResponse.json(
        { error: "Один из участников не найден" },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
        code: error?.code,
      },
      { status: 500 }
    );
  }
}
