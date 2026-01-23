import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import { 
  getUserChats, 
  getOrCreatePrivateChat,
  ChatFilter 
} from "@/lib/chat-service";
import { sendUserNotification } from "@/lib/notifications";
import { invalidateChatCache, invalidateUserChatsCache } from "@/lib/chat-redis";
import { withCache, getCacheKey } from "@/lib/cache";
import * as Sentry from "@sentry/nextjs";

const AI_CHAT_NAME = "ИИ-Ассистент";
const AI_BOT_ID = "ai-assistant-bot";

/**
 * Получает или создает чат с ИИ-ассистентом
 */
async function getOrCreateAIChat(userId: string) {
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
 * GET /api/chat
 * Получить список чатов пользователя
 */
export async function GET(request: NextRequest) {
  let session: any = null;
  let filter: ChatFilter = {};
  try {
    session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

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
      },
    });

    const isMemberMode = user?.viewMode === "MEMBER";
    const isPPOHeadMode = user?.viewMode === "PPO_HEAD" || 
      (user?.isPPOHead && !user?.viewMode) || // Обратная совместимость
      (user?.isMPOHead && !user?.viewMode) ||
      (user?.isRPOHead && !user?.viewMode);

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
          // Импортируем функцию синхронизации динамически, чтобы избежать проблем с зависимостями
          const { syncAllOrganizationChannels } = await import("@/lib/channel-sync");
          // Синхронизируем каналы в фоне (не блокируем ответ)
          syncAllOrganizationChannels(organizationId).catch((error) => {
            console.warn("[chat] Background channel sync error:", error);
          });
        }
      }
    } catch (syncError) {
      // Игнорируем ошибки синхронизации, не блокируем загрузку чатов
      console.warn("[chat] Channel sync check error:", syncError);
    }

    // Кешируем список чатов на короткое время (15 сек)
    let chats: any[] = [];
    try {
      const cacheKey = getCacheKey(`user:chats:${userId}`, filter);
      
      const result = await Sentry.startSpan(
        {
          op: "db.query",
          name: "GET /api/chat - getUserChats",
        },
        async (span) => {
          span.setAttribute("userId", userId);
          span.setAttribute("filter", JSON.stringify(filter));
          
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

    // Фильтруем ИИ чат из основного списка (он будет добавлен отдельно)
    let filteredChats = Array.isArray(chats) ? chats.filter((c: any) => c && c.name !== AI_CHAT_NAME) : [];

    // В режиме участника (MEMBER) фильтруем чаты:
    // - Только личные чаты (PRIVATE)
    // - Свои обращения (где userId === session.user.id)
    // - Каналы (CHANNEL) - только для просмотра и комментирования
    if (isMemberMode) {
      // Получаем ID своих обращений
      const userTickets = await prisma.ticket.findMany({
        where: { userId },
        select: { chatId: true },
      });
      const userTicketChatIds = userTickets
        .map(t => t.chatId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      filteredChats = filteredChats.filter((chat: any) => {
        // Личные чаты - всегда показываем
        if (chat.type === "PRIVATE") {
          return true;
        }
        
        // Свои обращения - показываем
        if (chat.ticketId && userTicketChatIds.includes(chat.id)) {
          return true;
        }
        
        // Каналы - показываем только те, где пользователь участник
        // (каналы председателя автоматически подписывают всех членов организации)
        if (chat.type === "CHANNEL") {
          return true; // Уже отфильтровано по участию в getUserChats
        }
        
        // Групповые чаты (не обращения) - скрываем в режиме участника
        return false;
      });
    }

    // Добавляем ИИ чат, если нужно
    let finalChats = filteredChats;
    if (includeAI && !filter.hasTicket) {
      try {
        const aiChat = await getOrCreateAIChat(userId);
        if (aiChat) {
          const formattedAIChat = formatAIChat(aiChat, userId);
          // ИИ чат добавляем в начало списка
          finalChats = [formattedAIChat, ...filteredChats];
        }
      } catch (aiError) {
        console.error("[chat] Error loading AI chat:", aiError);
        // Продолжаем без ИИ чата
        finalChats = filteredChats;
      }
    }

    return NextResponse.json({ chats: finalChats || [] });
  } catch (error: any) {
    console.error("[chat] GET Error:", error);
    Sentry.captureException(error, {
      tags: { endpoint: 'GET /api/chat' },
      extra: { userId: session?.user?.id, filter },
    });
    
    const statusCode = (error as any)?.statusCode || (error as any)?.status || 500;
    return NextResponse.json(
      { 
        error: "Ошибка при загрузке чатов",
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
      { status: statusCode }
    );
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

    // Создаем личный чат
    if (targetUserId) {
      const result = await getOrCreatePrivateChat(userId, targetUserId);
      chat = result.chat;
      isNew = result.isNew;
    } 
    // Создаем групповой чат
    else if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
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
            
            const newsChannel = await prisma.newsChannel.create({
              data: {
                name: name || defaultName,
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

    // Получаем информацию о другом пользователе для личного чата
    let otherUser = null;
    if (chat.type === 'PRIVATE') {
      const otherParticipant = chat.participants.find(p => p.userId !== userId);
      if (otherParticipant?.user) {
        otherUser = normalizeUserAvatar(otherParticipant.user);
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
