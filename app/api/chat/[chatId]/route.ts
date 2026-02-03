import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireChatAccess, ChatAccessError } from '@/lib/chat-service';
import { normalizeUserAvatar } from '@/lib/api-helpers';
import { getFileUrlWithCDN } from '@/lib/cdn';
import * as Sentry from '@sentry/nextjs';
import { sendUserNotification, stripHtml } from '@/lib/notifications';
import { 
  invalidateChatCache, 
  invalidateUserChatsCache,
  cacheChatMessages,
  getCachedChatMessages,
  cacheChatData,
  getCachedChatData,
} from '@/lib/chat-redis';
import { ensureMeetingGroupChat } from '@/lib/meeting-chat';
import { ChatType } from '@prisma/client';
// Динамический импорт для избежания проблем при сборке
// Кэшируем модуль для производительности
let socketModule: typeof import('@/server/socket') | null = null;
async function emitNewMessage(chatId: string, message: any) {
  try {
    if (!socketModule) {
      socketModule = await import('@/server/socket');
    }
    socketModule.emitNewMessage(chatId, message);
  } catch (error) {
    console.error('[chat] Failed to emit message via WebSocket:', error);
    // Не пробрасываем ошибку, чтобы не прерывать основной поток
  }
}

/**
 * GET /api/chat/[chatId]
 * Получить информацию о чате и сообщения
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const { searchParams } = new URL(request.url);
    
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor');
    const direction = searchParams.get('direction') || 'newer';

    // Проверяем доступ к чату
    let chatAccess: { chat: any; participant: any } | null = null;
    try {
      chatAccess = await requireChatAccess(chatId, session.user.id);
      console.log(`[chat/${chatId}] ========== MESSAGES LOADING DEBUG ==========`);
      console.log(`[chat/${chatId}] Access granted for user ${session.user.id}, chat type: ${chatAccess.chat?.type}`);
      
      // Получаем всех участников чата для логирования
      const allParticipants = await prisma.chatParticipant.findMany({
        where: { chatId, leftAt: null },
        select: { userId: true, role: true },
      });
      
      console.log(`[chat/${chatId}] Chat participants (${allParticipants.length}):`, 
        allParticipants.map(p => ({ userId: p.userId, role: p.role }))
      );
    } catch (error) {
      if (error instanceof ChatAccessError) {
        console.warn(`[chat/${chatId}] Access denied for user ${session.user.id}: ${error.message}`);
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Если доступ по заседанию (participant === null, но есть meetingId) — синхронизируем участников,
    // чтобы пользователь попал в ChatParticipant и видел переписку без ошибок
    if (chatAccess.participant === null && chatAccess.chat?.meetingId) {
      try {
        await ensureMeetingGroupChat(chatAccess.chat.meetingId);
        await invalidateChatCache(chatId).catch(() => {});
        await invalidateUserChatsCache(session.user.id).catch(() => {});
      } catch (syncErr) {
        console.warn(`[chat/${chatId}] ensureMeetingGroupChat on open:`, syncErr);
      }
    }

    // Пытаемся получить кэшированные данные чата (не даём кэшу ломать ответ)
    let chat: any = null;
    try {
      chat = await getCachedChatData(chatId);
    } catch (cacheErr) {
      console.warn(`[chat/${chatId}] getCachedChatData error:`, cacheErr);
    }
    if (!chat) {
      // Загружаем чат из БД
      chat = await prisma.chat.findUnique({
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
                avatarUrl: true,
              },
            },
          },
        },
        ticket: {
          select: {
            id: true,
            publicId: true,
            title: true,
            status: true,
            userId: true,
            organizationId: true,
            type: true,
            priority: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                avatarUrl: true,
                email: true,
              },
            },
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            participants: true,
          },
        },
      } as any,
      });
    }

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Кэшируем данные чата для следующих запросов
    await cacheChatData(chatId, chat).catch(err => 
      console.warn('[chat] Cache error:', err)
    );

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ОТКЛЮЧАЕМ КЭШ СООБЩЕНИЙ ПОЛНОСТЬЮ
    // Кэш сообщений вызывает проблемы - сообщения пропадают после обновления
    // ВСЕГДА загружаем сообщения напрямую из БД для гарантии актуальности
    // TODO: Восстановить кэш после полного исправления проблемы с пропаданием сообщений
    const cachedMessages = null; // ВРЕМЕННО ОТКЛЮЧЕНО: await getCachedChatMessages(chatId, cursor || undefined, direction);
    
    console.log(`[chat/${chatId}] ⚠️ CACHE DISABLED: Loading messages directly from DB (cache bypassed)`);
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Если кэш вернул пустой массив [], это может быть кэшированный пустой результат
    // В этом случае нужно проверить БД, чтобы убедиться что сообщений действительно нет
    // Используем кэш ТОЛЬКО если он вернул не-null И не пустой массив
    if (cachedMessages !== null && cachedMessages.length > 0) {
      console.log(`[chat/${chatId}] Using cached messages: ${cachedMessages.length} messages`);
      // Если есть кэш, возвращаем его (но все равно загружаем историю операций если нужно)
      let activityMessages: any[] = [];
      if (chat.ticket) {
        const actionLogs = await prisma.ticketActionLog.findMany({
          where: { ticketId: chat.ticket.id },
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
          orderBy: { createdAt: 'asc' },
        });

        activityMessages = actionLogs.map((log) => ({
          id: `activity_${log.id}`,
          chatId,
          senderId: log.userId,
          content: log.description || `Операция: ${log.actionType}`,
          messageType: 'activity',
          createdAt: log.createdAt,
          editedAt: null,
          isRead: false,
          isActivity: true,
          activityType: log.actionType === 'created' ? 'status_changed' : 
                       log.actionType === 'status_changed' ? 'status_changed' :
                       log.actionType === 'comment_added' ? 'message_edited' :
                       'file_attached',
          activityData: log.metadata,
          sender: {
            id: log.user.id,
            firstName: log.user.firstName,
            lastName: log.user.lastName,
            middleName: null,
            avatarUrl: normalizeUserAvatar(log.user)?.avatarUrl || null,
          },
          reactions: {},
          attachments: [],
          threadRepliesCount: 0,
        }));
      }

      const allMessages = [...cachedMessages, ...activityMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      return NextResponse.json({
        chat,
        messages: allMessages,
        pagination: {
          hasMore: false, // Из кэша не знаем hasMore
          oldestMessageId: allMessages.length > 0 ? allMessages[0].id : null,
          newestMessageId: allMessages.length > 0 ? allMessages[allMessages.length - 1].id : null,
        },
        cached: true, // Флаг что данные из кэша
      });
    }

    // Загружаем историю операций обращения, если это чат обращения
    let activityMessages: any[] = [];
    if (chat.ticket) {
      const actionLogs = await prisma.ticketActionLog.findMany({
        where: { ticketId: chat.ticket.id },
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
        orderBy: { createdAt: 'asc' },
      });

      activityMessages = actionLogs.map((log) => ({
        id: `activity_${log.id}`,
        chatId,
        senderId: log.userId,
        content: log.description || `Операция: ${log.actionType}`,
        messageType: 'activity',
        createdAt: log.createdAt,
        editedAt: null,
        isRead: false,
        isActivity: true,
        activityType: log.actionType === 'created' ? 'status_changed' : 
                     log.actionType === 'status_changed' ? 'status_changed' :
                     log.actionType === 'comment_added' ? 'message_edited' :
                     'file_attached',
        activityData: log.metadata,
        sender: {
          id: log.user.id,
          firstName: log.user.firstName,
          lastName: log.user.lastName,
          middleName: null,
          avatarUrl: normalizeUserAvatar(log.user)?.avatarUrl || null,
        },
        reactions: {},
        attachments: [],
        threadRepliesCount: 0,
      }));
    }

    // Загружаем сообщения
    const whereClause: any = {
      chatId,
      threadRootId: null, // Только сообщения верхнего уровня, не треды
    };

    if (cursor) {
      const cursorMessage = await prisma.chatMessage.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });
      
      if (cursorMessage) {
        whereClause.createdAt = direction === 'older' 
          ? { lt: cursorMessage.createdAt }
          : { gt: cursorMessage.createdAt };
      }
    }

    // Загружаем сообщения с оптимизированными полями
    // ВАЖНО: Используем include для совместимости с форматированием сообщений
    console.log(`[chat/${chatId}] Loading messages from DB (bypassing cache or cache miss)`);
    console.log(`[chat/${chatId}] Loading messages with whereClause:`, JSON.stringify(whereClause, null, 2));
    console.log(`[chat/${chatId}] Query params: limit=${limit}, direction=${direction}, cursor=${cursor || 'none'}`);
    
    // Сначала проверяем, есть ли вообще сообщения в этом чате
    const totalMessagesCount = await prisma.chatMessage.count({
      where: { chatId },
    });
    console.log(`[chat/${chatId}] Total messages in chat (all): ${totalMessagesCount}`);
    
    const rootMessagesCount = await prisma.chatMessage.count({
      where: { 
        chatId,
        threadRootId: null,
      },
    });
    console.log(`[chat/${chatId}] Root messages (no thread): ${rootMessagesCount}`);
    
    // КРИТИЧЕСКАЯ ДИАГНОСТИКА: Показать ВСЕ сообщения в чате с их threadRootId
    if (totalMessagesCount > 0 && rootMessagesCount === 0) {
      console.error(`[chat/${chatId}] ⚠️ ALL messages have threadRootId! This is likely a bug.`);
      const allMessagesDebug = await prisma.chatMessage.findMany({
        where: { chatId },
        select: {
          id: true,
          content: true,
          threadRootId: true,
          senderId: true,
          createdAt: true,
        },
        take: 10,
      });
      console.error(`[chat/${chatId}] First 10 messages:`, allMessagesDebug.map(m => ({
        id: m.id,
        threadRootId: m.threadRootId,
        senderId: m.senderId,
        contentPreview: m.content?.substring(0, 50),
      })));
    }
    
    // Для чатов обращений: дополнительная проверка
    if (chat.ticket && totalMessagesCount === 0) {
      console.error(`[chat/${chatId}] ⚠️ TICKET CHAT HAS NO MESSAGES! Ticket ID: ${chat.ticket.id}, Public ID: ${chat.ticket.publicId}`);
      console.error(`[chat/${chatId}] This means the initial message was not created when the ticket was created.`);
    }
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА: Для чатов обращений проверяем наличие начального сообщения
    if (chat.ticket) {
      // Проверяем ВСЕ сообщения от создателя обращения (не только первые 5)
      const initialMessages = await prisma.chatMessage.findMany({
        where: {
          chatId,
          threadRootId: null,
          senderId: chat.ticket.userId, // Сообщения от создателя обращения
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          messageType: true,
          _count: { select: { attachments: true } },
        },
        orderBy: { createdAt: 'asc' },
        // Берем все сообщения, не только первые 5
      });
      
      console.log(`[chat/${chatId}] ========== INITIAL MESSAGES CHECK ==========`);
      console.log(`[chat/${chatId}] Ticket ID: ${chat.ticket.id}, Public ID: ${chat.ticket.publicId}`);
      console.log(`[chat/${chatId}] Ticket creator (senderId): ${chat.ticket.userId}`);
      console.log(`[chat/${chatId}] Found ${initialMessages.length} messages from ticket creator:`, 
        initialMessages.map(m => ({
          id: m.id,
          contentPreview: m.content?.substring(0, 100) || 'NO CONTENT',
          contentLength: m.content?.length || 0,
          messageType: m.messageType,
          attachmentsCount: m._count.attachments,
          createdAt: m.createdAt,
        }))
      );
      
      // Проверяем, есть ли сообщение с текстом обращения (должно содержать "Обращение #" и текст)
      const hasInitialAppealMessage = initialMessages.some(m => 
        m.content?.includes('**Обращение #') || 
        m.content?.includes('Текст обращения:')
      );
      
      if (!hasInitialAppealMessage && initialMessages.length > 0) {
        console.error(`[chat/${chatId}] ❌ CRITICAL: Found ${initialMessages.length} messages from creator, but NONE contain appeal text!`);
        console.error(`[chat/${chatId}] Message contents:`, initialMessages.map(m => m.content?.substring(0, 200)));
      }
      
      if (initialMessages.length === 0) {
        console.error(`[chat/${chatId}] ❌ CRITICAL: No initial message found for ticket chat! Ticket ID: ${chat.ticket.id}`);
        console.error(`[chat/${chatId}] This means the initial message was NOT created when the ticket was created.`);
        console.error(`[chat/${chatId}] Ticket created at: ${chat.ticket.createdAt}`);
      }
    }
    
    // Если в БД есть сообщения, но кэш был пустым - это проблема кэша
    if (totalMessagesCount > 0 && cachedMessages && cachedMessages.length === 0) {
      console.warn(`[chat/${chatId}] ⚠️ CACHE INCONSISTENCY: DB has ${totalMessagesCount} messages but cache was empty!`);
    }
    
    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
      take: limit + 1, // +1 для проверки hasMore
      orderBy: { createdAt: direction === 'older' ? 'desc' : 'asc' },
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
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
        reactions: {
          select: {
            id: true,
            userId: true,
            emoji: true,
            createdAt: true,
          },
        },
        attachments: {
          select: {
            id: true,
            type: true,
            url: true,
            name: true,
            size: true,
            mimeType: true,
            thumbnailUrl: true,
            width: true,
            height: true,
            createdAt: true,
          },
          // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Убеждаемся что attachments загружаются
          orderBy: {
            createdAt: 'asc',
          },
        },
        readBy: {
          select: {
            userId: true,
            readAt: true,
          },
        },
        _count: {
          select: {
            threadReplies: true,
          },
        },
      },
    });

    // КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Проверяем что вернулось из БД
    console.log(`[chat/${chatId}] ========== DB QUERY RESULT ==========`);
    console.log(`[chat/${chatId}] Loaded ${messages.length} messages from DB`);
    console.log(`[chat/${chatId}] whereClause:`, JSON.stringify(whereClause, null, 2));
    
    if (messages.length > 0) {
      console.log(`[chat/${chatId}] First message:`, {
        id: messages[0].id,
        senderId: messages[0].senderId,
        content: messages[0].content?.substring(0, 100) || 'NO CONTENT',
        messageType: messages[0].messageType,
        threadRootId: messages[0].threadRootId,
        attachmentsCount: messages[0].attachments?.length || 0,
        createdAt: messages[0].createdAt,
      });
      console.log(`[chat/${chatId}] Last message:`, {
        id: messages[messages.length - 1].id,
        senderId: messages[messages.length - 1].senderId,
        content: messages[messages.length - 1].content?.substring(0, 100) || 'NO CONTENT',
        messageType: messages[messages.length - 1].messageType,
        threadRootId: messages[messages.length - 1].threadRootId,
        attachmentsCount: messages[messages.length - 1].attachments?.length || 0,
        createdAt: messages[messages.length - 1].createdAt,
      });
      
      // КРИТИЧЕСКАЯ ПРОВЕРКА: Для чатов обращений проверяем наличие начального сообщения с текстом
      if (chat.ticket) {
        const hasInitialAppealMessage = messages.some(m => 
          m.content?.includes('**Обращение #') || 
          m.content?.includes('Текст обращения:')
        );
        
        if (!hasInitialAppealMessage) {
          console.error(`[chat/${chatId}] ❌ CRITICAL: Loaded ${messages.length} messages, but NONE contain appeal text!`);
          console.error(`[chat/${chatId}] Message types:`, messages.map(m => ({ 
            id: m.id, 
            type: m.messageType, 
            contentPreview: m.content?.substring(0, 50) 
          })));
        } else {
          console.log(`[chat/${chatId}] ✅ Found initial appeal message in loaded messages`);
        }
      }
    } else {
      console.warn(`[chat/${chatId}] ⚠️ NO MESSAGES LOADED FROM DB!`);
      console.warn(`[chat/${chatId}] whereClause was:`, JSON.stringify(whereClause));
      
      // Для чатов обращений это критическая проблема
      if (chat.ticket) {
        console.error(`[chat/${chatId}] ❌ CRITICAL: Ticket chat has NO messages! Ticket ID: ${chat.ticket.id}`);
      }
    }

    // Проверяем есть ли еще сообщения
    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;
    
    // Если загружаем старые - нужно перевернуть обратно в хронологическом порядке
    if (direction === 'older') {
      resultMessages.reverse();
    }

    // Получаем участников чата для проверки прочтения
    const chatParticipants = await prisma.chatParticipant.findMany({
      where: {
        chatId,
        leftAt: null,
      },
      select: {
        userId: true,
      },
    });
    const userId = session.user.id;
    const otherParticipantIds = chatParticipants
      .map(p => p.userId)
      .filter(id => id !== userId);

    // Для каналов: загружаем все опубликованные посты из NewsChannel
    // и добавляем их как виртуальные сообщения, если их еще нет в чате
    const postIds: string[] = [];
    const existingPostIds = new Set<string>();
    
    // Собираем ID постов из существующих сообщений
    resultMessages.forEach((msg: any) => {
      if (msg.messageType === 'channel_post') {
        try {
          const postData = JSON.parse(msg.content);
          if (postData.postId) {
            postIds.push(postData.postId);
            existingPostIds.add(postData.postId);
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    });

    // Также собираем ID постов из пересланных сообщений (если они есть)
    resultMessages.forEach((msg: any) => {
      if (msg.messageType === 'channel_post') {
        try {
          const postData = JSON.parse(msg.content);
          // Для пересланных постов также нужно загрузить данные поста
          if (postData.postId && !existingPostIds.has(postData.postId)) {
            postIds.push(postData.postId);
            existingPostIds.add(postData.postId);
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    });

    // Если это канал, загружаем все опубликованные посты из NewsChannel
    // ВАЖНО: Посты загружаются для ВСЕХ участников канала, независимо от viewMode
    // Получаем newsChannelId отдельным запросом, если нужно
    let newsChannelId: string | null = null;
    if ((chat.type as string) === 'CHANNEL') {
      const channelWithNews = await prisma.$queryRaw<Array<{ newsChannelId: string | null }>>`
        SELECT "newsChannelId" FROM "Chat" WHERE id = ${chatId}
      `;
      newsChannelId = channelWithNews[0]?.newsChannelId || null;
      
      console.log(`[chat/${chatId}] Channel detected, newsChannelId: ${newsChannelId}, userId: ${session.user.id}`);
      
      // Логируем для диагностики
      if (!newsChannelId) {
        console.warn(`[chat/${chatId}] Channel has no newsChannelId - posts will not be loaded`);
      }
    }
    
    if ((chat.type as string) === 'CHANNEL' && newsChannelId) {
      console.log(`[chat/${chatId}] Loading published posts for channel ${newsChannelId} (user: ${session.user.id})`);
      
      // ОПТИМИЗАЦИЯ: Ограничиваем количество постов для загрузки (пагинация)
      const MAX_CHANNEL_POSTS = 50; // Загружаем только последние 50 постов
      const channelPosts = await prisma.newsPost.findMany({
        where: {
          channelId: newsChannelId,
          isPublished: true,
        },
        select: {
          id: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: MAX_CHANNEL_POSTS, // ОПТИМИЗАЦИЯ: Ограничение количества
      });

      console.log(`[chat/${chatId}] Found ${channelPosts.length} published posts in channel ${newsChannelId}`);
      
      if (channelPosts.length === 0) {
        console.warn(`[chat/${chatId}] No published posts found in channel ${newsChannelId}. Checking all posts...`);
        // Проверяем, есть ли вообще посты в канале (даже неопубликованные)
        const allPosts = await prisma.newsPost.findMany({
          where: { channelId: newsChannelId },
          select: { id: true, isPublished: true, createdAt: true },
        });
        console.log(`[chat/${chatId}] Total posts in channel: ${allPosts.length} (published: ${allPosts.filter(p => p.isPublished).length})`);
      }

      // Добавляем посты, которых еще нет в сообщениях
      for (const post of channelPosts) {
        if (!existingPostIds.has(post.id)) {
          postIds.push(post.id);
        }
      }
      
      console.log(`[chat/${chatId}] Added ${postIds.length} post IDs to load (${postIds.length - existingPostIds.size} new posts, ${existingPostIds.size} already in messages)`);
    } else if ((chat.type as string) === 'CHANNEL' && !newsChannelId) {
      console.warn(`[chat/${chatId}] Channel has no newsChannelId - posts will not be loaded`);
    }

    // Загружаем данные постов одним запросом
    const postsMap = new Map<string, any>();
    const postsAuthorsMap = new Map<string, any>(); // Отдельная карта для авторов
    if (postIds.length > 0) {
      console.log(`[chat/${chatId}] Loading ${postIds.length} posts data`);
      const posts = await prisma.newsPost.findMany({
        where: { id: { in: postIds } },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              avatarUrl: true,
            },
          },
          polls: {
            include: {
              _count: {
                select: {
                  votes: true,
                },
              },
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
      });

      // Сохраняем авторов отдельно
      posts.forEach(post => {
        if (post.author) {
          postsAuthorsMap.set(post.id, post.author);
        }
      });

      // Получаем голоса пользователя в опросах
      const pollIds = posts.flatMap(p => p.polls.map(poll => poll.id));
      let userPollVotes: Record<string, string> = {};
      if (pollIds.length > 0 && userId) {
        const votes = await prisma.newsPollVote.findMany({
          where: {
            userId,
            pollId: { in: pollIds },
          },
          select: {
            pollId: true,
            optionId: true,
          },
        });
        userPollVotes = votes.reduce(
          (acc, vote) => {
            acc[vote.pollId] = vote.optionId;
            return acc;
          },
          {} as Record<string, string>
        );
      }

      // Получаем лайки пользователя для постов
      const likedPostIds = posts.map(p => p.id);
      let userLikes: Set<string> = new Set();
      if (likedPostIds.length > 0 && userId) {
        const likes = await prisma.newsLike.findMany({
          where: {
            userId,
            newsPostId: { in: likedPostIds },
          },
          select: {
            newsPostId: true,
          },
        });
        userLikes = new Set(likes.map(like => like.newsPostId));
      }

      // ОПТИМИЗАЦИЯ: Загружаем статистику голосов для всех опросов одним запросом
      const allPollIds = posts.flatMap(p => p.polls.map(poll => poll.id));
      const allVotesMap = new Map<string, Map<string, number>>(); // pollId -> optionId -> count
      
      if (allPollIds.length > 0) {
        const allVotes = await prisma.newsPollVote.groupBy({
          by: ["pollId", "optionId"],
          where: {
            pollId: { in: allPollIds },
          },
          _count: {
            optionId: true,
          },
        });

        // Группируем по pollId
        for (const vote of allVotes) {
          if (!allVotesMap.has(vote.pollId)) {
            allVotesMap.set(vote.pollId, new Map());
          }
          allVotesMap.get(vote.pollId)!.set(vote.optionId, vote._count.optionId);
        }
      }

      // Получаем статистику голосов для каждого опроса (используем предзагруженные данные)
      for (const post of posts) {
        const pollsWithStats = await Promise.all(
          post.polls.map(async (poll) => {
            const votesMap = allVotesMap.get(poll.id) || new Map();
            const votes = Array.from(votesMap.entries()).map(([optionId, count]) => ({
              optionId,
              _count: { optionId: count },
            }));

            const totalVotes = votes.reduce((sum, v) => sum + v._count.optionId, 0);
            const options = poll.options as Array<{ id: string; text: string }>;
            const optionsWithStats = options.map((option) => {
              const voteCount = votes.find((v) => v.optionId === option.id)?._count.optionId || 0;
              const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 1000) / 10 : 0;

              return {
                ...option,
                voteCount,
                percentage,
              };
            });

            return {
              id: poll.id,
              question: poll.question,
              options: optionsWithStats,
              totalVotes,
              userVote: userPollVotes[poll.id] || null,
              isClosed: poll.isClosed,
            };
          })
        );

        postsMap.set(post.id, {
          id: post.id,
          title: post.title,
          content: post.content,
          coverImage: post.coverImage,
          polls: pollsWithStats,
          _count: post._count,
          isLiked: userLikes.has(post.id),
        });
      }
      
      console.log(`[chat/${chatId}] Loaded ${postsMap.size} posts into postsMap`);
    } else if (postIds.length === 0 && (chat.type as string) === 'CHANNEL') {
      console.warn(`[chat/${chatId}] No post IDs to load for channel`);
    }

    // Форматируем сообщения (один битый объект не должен ломать весь ответ)
    const formattedMessages = resultMessages.map((msg: any) => {
      try {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обработка сообщений от ИИ-ассистента
      const isAIMessage = msg.messageType === 'assistant' || msg.messageType === 'system';
      const AI_BOT_ID = 'ai-assistant-bot';
      
      // Для сообщений от ИИ используем виртуального бота
      let sender = msg.sender;
      if (isAIMessage && (!sender || sender.id === userId)) {
        sender = {
          id: AI_BOT_ID,
          firstName: 'ИИ',
          lastName: 'Ассистент',
          middleName: null,
          avatarUrl: null,
        };
      }
      
      // Проверяем что sender существует
      if (!sender) {
        console.error('[chat] Message without sender:', msg.id);
        return null;
      }
      
      // Проверяем, прочитано ли сообщение другими участниками
      // Для своих сообщений: прочитано, если все другие участники прочитали
      const isOwnMessage = msg.senderId === userId && !isAIMessage;
      let isRead = false;
      if (isOwnMessage && otherParticipantIds.length > 0) {
        const readByUserIds = (msg.readBy || []).map((r: any) => r.userId);
        isRead = otherParticipantIds.every(id => readByUserIds.includes(id));
      }

      // Парсим данные поста для сообщений типа channel_post
      let postData: any = null;
      if (msg.messageType === 'channel_post') {
        try {
          const parsed = JSON.parse(msg.content);
          const postId = parsed.postId;
          if (postId && postsMap.has(postId)) {
            postData = postsMap.get(postId);
            // Добавляем информацию о пересылке, если есть
            if (parsed.forwarded) {
              postData.forwarded = true;
              postData.originalChatId = parsed.originalChatId;
              if (parsed.channelId && parsed.channelName) {
                postData.channelId = parsed.channelId;
                postData.channelName = parsed.channelName;
              }
            }
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
      
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Нормализуем content - гарантируем что это строка
      let normalizedContent = '';
      if (msg.content) {
        if (typeof msg.content === 'string') {
          normalizedContent = msg.content;
        } else if (typeof msg.content === 'object') {
          // Если content - объект, пытаемся извлечь текст или преобразовать в JSON
          console.error(`[chat/${chatId}] ⚠️ Message ${msg.id} has object content instead of string:`, {
            messageId: msg.id,
            contentType: typeof msg.content,
            content: msg.content,
          });
          // Пытаемся найти текстовое поле в объекте
          normalizedContent = (msg.content as any).text || 
                             (msg.content as any).content || 
                             (msg.content as any).body ||
                             JSON.stringify(msg.content);
        } else {
          normalizedContent = String(msg.content);
        }
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Очищаем HTML теги из старых сообщений обращений
        // Проверяем, является ли это начальным сообщением обращения
        if (chat.ticket && normalizedContent.includes('Обращение #')) {
          // Если есть HTML теги - очищаем их
          if (normalizedContent.includes('<')) {
            normalizedContent = stripHtml(normalizedContent);
          }
          
          // Улучшаем форматирование старого сообщения для единообразия
          // Проверяем, есть ли уже правильное форматирование
          if (!normalizedContent.includes('**Обращение #') || !normalizedContent.includes('**Тема:**')) {
            normalizedContent = normalizedContent
              .replace(/Обращение\s*#?(\d+)/gi, '**Обращение #$1**')
              .replace(/(?:Тема|Заголовок)[:：]?\s*/gi, '**Тема:** ')
              .replace(/(?:Текст|Содержание|Сообщение)[:：]?\s*/gi, '**Текст обращения:**\n');
          }
        }
      }
      
      const formatted = {
      id: msg.id,
      chatId: msg.chatId,
      senderId: isAIMessage ? AI_BOT_ID : msg.senderId, // Для ИИ используем виртуальный ID
      content: normalizedContent, // Гарантируем что content всегда строка
      messageType: msg.messageType,
      createdAt: msg.createdAt,
      editedAt: msg.editedAt,
      isRead, // Статус прочтения для своих сообщений
      sender: {
        id: sender.id,
        firstName: sender.firstName,
        lastName: sender.lastName,
        middleName: sender.middleName,
        avatarUrl: isAIMessage ? null : (normalizeUserAvatar(sender)?.avatarUrl || null),
      },
      replyTo: msg.replyTo && msg.replyTo.sender ? {
        id: msg.replyTo.id,
        content: typeof msg.replyTo.content === 'string' ? msg.replyTo.content : String(msg.replyTo.content || ''),
        sender: {
          id: msg.replyTo.sender.id,
          firstName: msg.replyTo.sender.firstName,
          lastName: msg.replyTo.sender.lastName,
          avatarUrl: normalizeUserAvatar(msg.replyTo.sender)?.avatarUrl || null,
        },
      } : null,
      reactions: (msg.reactions || []).reduce((acc: any, r: any) => {
        if (!acc[r.emoji]) {
          acc[r.emoji] = { count: 0, userIds: [] };
        }
        acc[r.emoji].count!++;
        acc[r.emoji].userIds.push(r.userId);
        return acc;
      }, {} as Record<string, { count?: number; userIds: string[] }>),
      attachments: (msg.attachments || []).map((att: any) => {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Валидация attachment перед обработкой
        if (!att || !att.id) {
          console.warn(`[chat/${chatId}] Invalid attachment in message ${msg.id}:`, att);
          return null;
        }
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем что URL существует
        if (!att.url || typeof att.url !== 'string' || att.url.trim() === '') {
          console.error(`[chat/${chatId}] ❌ Attachment ${att.id} has empty URL in message ${msg.id}:`, {
            attachmentId: att.id,
            attachmentName: att.name,
            attachmentType: att.type,
            messageId: msg.id,
          });
          // Не возвращаем null, но логируем ошибку - возможно URL будет восстановлен через CDN
        }
        
        // Определяем, является ли сообщение старым (старше 7 дней)
        const messageAge = Date.now() - new Date(msg.createdAt).getTime();
        const isOld = messageAge > 7 * 24 * 60 * 60 * 1000; // 7 дней
        
        const attachmentUrl = att.url && att.url.trim() ? getFileUrlWithCDN(att.url, true) : '';
        const attachmentThumbnailUrl = att.thumbnailUrl && att.thumbnailUrl.trim() 
          ? getFileUrlWithCDN(att.thumbnailUrl, true) 
          : undefined;
        
        return {
          id: att.id,
          type: att.type,
          url: attachmentUrl, // Используем CDN URL
          name: att.name || 'Файл',
          size: att.size || 0,
          mimeType: att.mimeType || null,
          thumbnailUrl: attachmentThumbnailUrl,
          width: att.width || undefined,
          height: att.height || undefined,
          isOld, // Флаг для старых сообщений
        };
      }).filter((att: any) => att !== null), // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Фильтруем null attachments
      threadRepliesCount: msg._count?.threadReplies || 0,
      // Данные поста для channel_post
      post: postData,
    };
    return formatted;
  } catch (err) {
    console.error(`[chat/${chatId}] Error formatting message ${msg?.id}:`, err);
    return null;
  }
}).filter((msg: any) => msg !== null);

    // Для каналов: добавляем виртуальные сообщения для постов из NewsChannel,
    // которые еще не созданы как сообщения в чате
    // ВАЖНО: Посты показываются всем участникам канала, независимо от viewMode
    // Это позволяет председателю в режиме участника видеть посты в своих каналах
    if ((chat.type as string) === 'CHANNEL' && newsChannelId && postsMap.size > 0) {
      console.log(`[chat/${chatId}] Creating virtual messages for ${postsMap.size} posts`);
      const virtualMessages: any[] = [];
      
      for (const [postId, postData] of postsMap.entries()) {
        // Проверяем, есть ли уже сообщение для этого поста
        const hasMessage = formattedMessages.some((msg: any) => {
          if (msg.messageType === 'channel_post') {
            try {
              const parsed = JSON.parse(msg.content);
              return parsed.postId === postId;
            } catch (e) {
              return false;
            }
          }
          return false;
        });

        // Если сообщения нет, создаем виртуальное
        if (!hasMessage && postData) {
          const postAuthor = postsAuthorsMap.get(postId);
          
          if (postAuthor) {
            // Получаем дату создания поста
            const postRecord = await prisma.newsPost.findUnique({
              where: { id: postId },
              select: { createdAt: true },
            });

            if (postRecord) {
              // Загружаем реакции для виртуального сообщения поста
              // Реакции хранятся в ChatMessage, нужно найти сообщение по postId
              // Ищем все сообщения типа channel_post и фильтруем по postId в JSON
              const channelPostMessages = await prisma.chatMessage.findMany({
                where: {
                  chatId: chatId,
                  messageType: 'channel_post',
                },
                include: {
                  reactions: true,
                },
              });

              // Находим сообщение с нужным postId, парся JSON content
              let postMessage = null;
              for (const msg of channelPostMessages) {
                try {
                  const parsed = JSON.parse(msg.content);
                  if (parsed.postId === postId) {
                    postMessage = msg;
                    break;
                  }
                } catch (e) {
                  // Игнорируем ошибки парсинга
                }
              }

              // Форматируем реакции
              const virtualReactions = (postMessage?.reactions || []).reduce((acc: any, r: any) => {
                if (!acc[r.emoji]) {
                  acc[r.emoji] = { count: 0, userIds: [] };
                }
                acc[r.emoji].count!++;
                acc[r.emoji].userIds.push(r.userId);
                return acc;
              }, {} as Record<string, { count?: number; userIds: string[] }>);

              virtualMessages.push({
                id: postMessage?.id || `virtual_${postId}`, // Используем реальный ID если есть
                chatId: chatId,
                senderId: postAuthor.id,
                content: JSON.stringify({ postId }),
                messageType: 'channel_post',
                createdAt: postRecord.createdAt,
                editedAt: null,
                isRead: false,
                sender: {
                  id: postAuthor.id,
                  firstName: postAuthor.firstName,
                  lastName: postAuthor.lastName,
                  middleName: postAuthor.middleName,
                  avatarUrl: normalizeUserAvatar(postAuthor)?.avatarUrl || null,
                },
                replyTo: null,
                reactions: virtualReactions,
                attachments: [],
                threadRepliesCount: 0,
                threadLastReplyAt: null,
                post: postData,
              });
            }
          }
        }
      }

      // Объединяем реальные, виртуальные и системные сообщения, сортируем по дате
      const allMessages = [...formattedMessages, ...virtualMessages, ...activityMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      console.log(`[chat/${chatId}] ========== MESSAGES LOADING DEBUG ==========`);
      console.log(`[chat/${chatId}] User: ${session.user.id}, Chat type: ${chat.type}`);
      console.log(`[chat/${chatId}] Total messages: ${allMessages.length} (${formattedMessages.length} real, ${virtualMessages.length} virtual posts, ${activityMessages.length} activity)`);
      console.log(`[chat/${chatId}] Messages breakdown:`, {
        real: formattedMessages.length,
        virtual: virtualMessages.length,
        activity: activityMessages.length,
        total: allMessages.length,
        hasMore,
        limit,
        direction,
      });
      if (formattedMessages.length > 0) {
        console.log(`[chat/${chatId}] First message:`, {
          id: formattedMessages[0]?.id,
          senderId: formattedMessages[0]?.senderId,
          content: formattedMessages[0]?.content?.substring(0, 50),
          createdAt: formattedMessages[0]?.createdAt,
        });
        console.log(`[chat/${chatId}] Last message:`, {
          id: formattedMessages[formattedMessages.length - 1]?.id,
          senderId: formattedMessages[formattedMessages.length - 1]?.senderId,
          content: formattedMessages[formattedMessages.length - 1]?.content?.substring(0, 50),
          createdAt: formattedMessages[formattedMessages.length - 1]?.createdAt,
        });
      }

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: КЭШ ОТКЛЮЧЕН - не сохраняем сообщения в кэш
      // Это гарантирует, что сообщения всегда загружаются из БД
      // TODO: Восстановить кэш после полного исправления проблемы с пропаданием сообщений
      // await cacheChatMessages(chatId, formattedMessages, cursor || undefined, direction).catch(err =>
      //   console.warn('[chat] Cache error:', err)
      // );

      return NextResponse.json({
        chat,
        messages: allMessages,
        pagination: {
          hasMore,
          oldestMessageId: allMessages.length > 0 ? allMessages[0].id : null,
          newestMessageId: allMessages.length > 0 ? allMessages[allMessages.length - 1].id : null,
        },
      });
    }

    // Объединяем реальные и системные сообщения, сортируем по дате
    const allMessages = [...formattedMessages, ...activityMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: КЭШ ОТКЛЮЧЕН - не сохраняем сообщения в кэш
    // await cacheChatMessages(chatId, formattedMessages, cursor || undefined, direction).catch(err =>
    //   console.warn('[chat] Cache error:', err)
    // );

    // КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Проверяем что будет отправлено клиенту
    console.log(`[chat/${chatId}] ========== RESPONSE TO CLIENT ==========`);
    console.log(`[chat/${chatId}] formattedMessages: ${formattedMessages.length}`);
    console.log(`[chat/${chatId}] activityMessages: ${activityMessages.length}`);
    console.log(`[chat/${chatId}] allMessages (total): ${allMessages.length}`);

    // Логируем для отладки обращений
    if (chat.ticket) {
      console.log(`[chat/${chatId}] Загружено сообщений для обращения ${chat.ticket.publicId}:`, {
        обычных: formattedMessages.length,
        системных: activityMessages.length,
        всего: allMessages.length,
        ticketCreatorId: chat.ticket.userId,
      });
      
      // Проверяем, есть ли начальное сообщение от создателя обращения
      const initialMessage = formattedMessages.find((msg: any) => 
        msg.senderId === chat.ticket.userId && 
        msg.content?.includes('Обращение #')
      );
      
      if (!initialMessage) {
        console.warn(`[chat/${chatId}] ⚠️ WARNING: Initial message from ticket creator not found in formatted messages!`);
        console.warn(`[chat/${chatId}] Formatted messages from ticket creator:`, 
          formattedMessages
            .filter((msg: any) => msg.senderId === chat.ticket.userId)
            .map((msg: any) => ({
              id: msg.id,
              contentLength: msg.content?.length || 0,
              messageType: msg.messageType,
              createdAt: msg.createdAt,
            }))
        );
      } else {
        console.log(`[chat/${chatId}] ✅ Initial message found:`, {
          id: initialMessage.id,
          contentLength: initialMessage.content?.length || 0,
          attachmentsCount: initialMessage.attachments?.length || 0,
          createdAt: initialMessage.createdAt,
        });
      }
    }

    return NextResponse.json({
      chat,
      messages: allMessages,
      pagination: {
        hasMore,
        oldestMessageId: allMessages.length > 0 ? allMessages[0].id : null,
        newestMessageId: allMessages.length > 0 ? allMessages[allMessages.length - 1].id : null,
      },
    });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error('[chat] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/[chatId]
 * Отправить сообщение в чат
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем доступ
    try {
      await requireChatAccess(chatId, userId);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { content, replyToId, threadRootId, attachments, mentionedUserIds } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'Message cannot be empty' },
        { status: 400 }
      );
    }

    // Логируем для отладки
    console.log('[chat] POST request:', {
      chatId,
      userId,
      hasContent: !!content,
      contentLength: content.length,
      hasAttachments: !!attachments,
      attachmentsType: Array.isArray(attachments) ? attachments.length : typeof attachments,
    });

    // Проверяем replyToId
    if (replyToId) {
      const replyToMessage = await prisma.chatMessage.findUnique({
        where: { id: replyToId },
        select: { chatId: true },
      });

      if (!replyToMessage || replyToMessage.chatId !== chatId) {
        return NextResponse.json(
          { error: 'Reply message not found' },
          { status: 404 }
        );
      }
    }

    // Получаем информацию о чате для проверки типа и прав
    let chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: { leftAt: null },
          select: {
            userId: true,
            role: true,
          },
        },
        ticket: {
          select: { status: true },
        },
      },
    });

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    // Чат обращения: запрещаем отправку сообщений после закрытия
    if (chat.ticket) {
      const status = (chat.ticket as { status: string }).status;
      if (status === 'CLOSED' || status === 'RESOLVED') {
        return NextResponse.json(
          { error: 'Обращение закрыто. Отправка сообщений недоступна.' },
          { status: 403 }
        );
      }
    }
    
    // Проверяем, что отправитель является участником чата
    let senderParticipant = chat.participants.find(p => p.userId === userId);
    // Чат заседания: если пользователь ещё не в ChatParticipant — синхронизируем участников
    if (!senderParticipant && chat?.meetingId) {
      try {
        await ensureMeetingGroupChat(chat.meetingId);
        await invalidateChatCache(chatId).catch(() => {});
        const refreshed = await prisma.chat.findUnique({
          where: { id: chatId },
          include: {
            participants: {
              where: { leftAt: null },
              select: { userId: true, role: true },
            },
            ticket: { select: { status: true } },
          },
        });
        if (refreshed) {
          chat = refreshed as typeof chat;
          senderParticipant = chat.participants.find((p: { userId: string }) => p.userId === userId);
        }
      } catch (syncErr) {
        console.warn(`[chat/${chatId}] ensureMeetingGroupChat before send:`, syncErr);
      }
    }
    if (!senderParticipant) {
      console.error(`[chat/${chatId}] ❌ User ${userId} is not a participant of chat ${chatId}`);
      return NextResponse.json(
        { error: 'Вы не являетесь участником этого чата' },
        { status: 403 }
      );
    }
    
    console.log(`[chat/${chatId}] Chat participants:`, {
      total: chat.participants.length,
      participantIds: chat.participants.map(p => p.userId),
      senderIsParticipant: !!senderParticipant,
    });

    // Логика для каналов (CHANNEL): только председатель/админ может создавать посты
    // Используем приведение типа, так как Prisma Client может не экспортировать enum значения напрямую
    if ((chat.type as string) === 'CHANNEL') {
      const participant = chat.participants[0];
      const isAdmin = participant?.role === 'admin';
      
      // Если это не ответ в треде (threadRootId отсутствует), проверяем права
      if (!threadRootId) {
        if (!isAdmin) {
          return NextResponse.json(
            { error: 'В каналах только председатель может создавать посты. Вы можете комментировать посты в тредах.' },
            { status: 403 }
          );
        }
      }
      // Если это ответ в треде, проверяем что тред существует
      else {
        const threadRoot = await prisma.chatMessage.findFirst({
          where: {
            id: threadRootId,
            chatId,
            threadRootId: null, // Корневое сообщение треда
          },
        });

        if (!threadRoot) {
          return NextResponse.json(
            { error: 'Тред не найден' },
            { status: 404 }
          );
        }
      }
    }
    // Для обычных чатов проверяем threadRootId если указан
    else if (threadRootId) {
      const threadRoot = await prisma.chatMessage.findFirst({
        where: {
          id: threadRootId,
          chatId,
          threadRootId: null,
        },
      });

      if (!threadRoot) {
        return NextResponse.json(
          { error: 'Thread not found' },
          { status: 404 }
        );
      }
    }

    // Получаем отправителя
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    if (!sender) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Создаем сообщение
    console.log(`[chat/${chatId}] ========== MESSAGE CREATION DEBUG ==========`);
    console.log(`[chat/${chatId}] Creating message:`, {
      chatId,
      userId,
      contentLength: content.length,
      hasReplyTo: !!replyToId,
      hasThreadRoot: !!threadRootId,
      hasAttachments: !!attachments,
    });
    
    const messageData: any = {
      chatId,
      senderId: userId,
      content: content.trim(),
      messageType: 'text',
      replyToId: replyToId || null,
      threadRootId: threadRootId || null,
    };

    // Добавляем вложения ТОЛЬКО если они есть, валидны и не пустые
    // НЕ добавляем attachments в messageData если их нет - это важно!
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      try {
        const validAttachments = attachments
          .filter((att: any) => {
            // Фильтруем только те, у которых есть url или filePath
            const hasUrl = att?.url || att?.filePath;
            return att && typeof att === 'object' && hasUrl;
          })
          .map((att: any) => {
            const url = att.url || att.filePath;
            if (!url || typeof url !== 'string' || url.trim().length === 0) {
              throw new Error('Attachment must have valid url or filePath');
            }
            
            return {
              type: (att.type && typeof att.type === 'string') ? att.type : 'file',
              url: url.trim(), // Обязательное поле, не может быть null или пустым
              name: (att.name || att.fileName || att.originalName || 'Файл').toString(),
              size: (att.size || att.fileSize) ? parseInt(String(att.size || att.fileSize)) : undefined,
              mimeType: att.mimeType ? String(att.mimeType) : undefined,
              thumbnailUrl: att.thumbnailUrl ? String(att.thumbnailUrl) : undefined,
              width: att.width ? parseInt(String(att.width)) : undefined,
              height: att.height ? parseInt(String(att.height)) : undefined,
            };
          });
        
        // Добавляем attachments ТОЛЬКО если есть валидные
        if (validAttachments.length > 0) {
          messageData.attachments = {
            create: validAttachments,
          };
          console.log('[chat] Adding attachments:', validAttachments.length);
        } else {
          console.log('[chat] No valid attachments after filtering');
        }
      } catch (attachmentError: any) {
        console.error('[chat] Error processing attachments:', attachmentError);
        // Не прерываем создание сообщения, просто не добавляем attachments
      }
    } else {
      console.log('[chat] No attachments provided');
    }

    console.log('[chat] Creating message with data:', {
      chatId: messageData.chatId,
      senderId: messageData.senderId,
      hasAttachments: !!messageData.attachments,
    });

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Используем транзакцию для гарантии сохранения
    const message = await prisma.$transaction(async (tx) => {
      // Создаем сообщение
      const createdMessage = await tx.chatMessage.create({
        data: messageData,
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          attachments: true,
        },
      });
      
      // КРИТИЧЕСКАЯ ПРОВЕРКА: Сразу проверяем в той же транзакции
      const verifyMessage = await tx.chatMessage.findUnique({
        where: { id: createdMessage.id },
        select: { id: true, chatId: true, senderId: true, content: true },
      });
      
      if (!verifyMessage) {
        throw new Error(`Message ${createdMessage.id} was not found in DB after creation within transaction!`);
      }
      
      // Обновляем чат в той же транзакции
      await tx.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: createdMessage.id,
          lastMessageAt: createdMessage.createdAt,
        },
      });
      
      return createdMessage;
    });
    
    console.log(`[chat/${chatId}] ✅ Message created and verified in DB transaction:`, {
      messageId: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      contentLength: message.content.length,
      createdAt: message.createdAt,
      threadRootId: message.threadRootId, // ВАЖНО: должен быть null для обычных сообщений
    });
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА: Убеждаемся что сообщение сохранено с правильным chatId
    if (message.chatId !== chatId) {
      console.error(`[chat/${chatId}] ❌ CRITICAL: Message saved with wrong chatId! Expected: ${chatId}, Got: ${message.chatId}`);
    }
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА: Для обычных сообщений threadRootId должен быть null
    if (message.threadRootId && !threadRootId) {
      console.error(`[chat/${chatId}] ❌ CRITICAL: Message has unexpected threadRootId: ${message.threadRootId}`);
    }
    
    // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Загружаем сообщение из БД отдельным запросом после транзакции
    const finalVerify = await prisma.chatMessage.findUnique({
      where: { id: message.id },
      select: { 
        id: true, 
        chatId: true, 
        senderId: true, 
        content: true, 
        threadRootId: true,
        createdAt: true,
      },
    });
    
    if (!finalVerify) {
      console.error(`[chat/${chatId}] ❌ CRITICAL: Message ${message.id} NOT FOUND in DB after transaction committed!`);
      return NextResponse.json(
        { error: 'Сообщение не было сохранено в базе данных после транзакции' },
        { status: 500 }
      );
    }
    
    console.log(`[chat/${chatId}] ✅ Final verification - message exists in DB:`, {
      id: finalVerify.id,
      chatId: finalVerify.chatId,
      threadRootId: finalVerify.threadRootId,
    });

    // Обновляем онлайн статус отправителя (чат уже обновлен в транзакции)
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          updatedAt: new Date(),
        },
      });
      console.log(`[chat/${chatId}] User online status updated`);
    } catch (updateError) {
      // Логируем но не прерываем выполнение
      console.warn(`[chat/${chatId}] Error updating user online status:`, updateError);
    }

    // Если это ответ в треде, обновляем метрики
    if (threadRootId) {
      const repliesCount = await prisma.chatMessage.count({
        where: {
          threadRootId,
          id: { not: threadRootId },
        },
      });

      await prisma.chatMessage.update({
        where: { id: threadRootId },
        data: {
          threadRepliesCount: repliesCount + 1,
          threadLastReplyAt: message.createdAt,
        },
      });
    }

    // Сбрасываем readAt для других участников
    await prisma.chatParticipant.updateMany({
      where: {
        chatId,
        userId: { not: userId },
        leftAt: null,
      },
      data: {
        readAt: null,
      },
    });

    // Отслеживание ответов в чате обращения (только если поля существуют в БД)
    try {
      const ticketChat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          ticket: {
            select: {
              id: true,
              userId: true,
              organizationId: true,
            },
          },
          participants: {
            where: { leftAt: null },
            select: {
              userId: true,
              role: true,
            },
          },
        },
      });

      if (ticketChat?.ticket) {
        const ticket = ticketChat.ticket;
        const isChairman = ticketChat.participants.some(
          (p) => p.userId === userId && p.role === "admin"
        );
        const isUser = ticket.userId === userId;

        // Проверяем наличие полей в схеме перед обновлением
        try {
          // Пытаемся получить ticket с новыми полями для проверки их существования
          const ticketWithFields = await prisma.ticket.findUnique({
            where: { id: ticket.id },
            select: {
              lastResponseAt: true,
            },
          });

          // Если запрос прошел успешно, значит поля существуют
          const now = new Date();

          // Если ответил председатель (админ чата)
          if (isChairman && !isUser) {
            // Устанавливаем дату последнего ответа председателя
            const userResponseDeadline = new Date(now);
            userResponseDeadline.setHours(userResponseDeadline.getHours() + 72); // 72 часа для ответа пользователя

            const updateData: any = {
              lastResponseAt: now,
              userResponseDeadline,
              isOverdue: false,
            };

            await prisma.ticket.update({
              where: { id: ticket.id },
              data: updateData,
            });
          }
          // Если ответил пользователь (после ответа председателя)
          else if (isUser && ticketWithFields?.lastResponseAt) {
            // Устанавливаем дату последнего ответа пользователя
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                lastUserResponseAt: now,
                userResponseDeadline: null,
              } as any,
            });
          }
        } catch (fieldError: any) {
          // Если поля не существуют в БД, просто игнорируем обновление
          // Это нормально до применения миграции
          console.log("[chat] Ticket deadline fields not available yet, skipping update");
        }
      }
    } catch (ticketTrackingError) {
      // Не прерываем выполнение, логируем ошибку
      console.error("[chat] Error tracking ticket response:", ticketTrackingError);
    }

    // Форматируем ответ
    if (!message.sender) {
      console.error('[chat] Message created but sender is missing:', message.id);
      return NextResponse.json(
        { error: 'Message sender is missing' },
        { status: 500 }
      );
    }

    try {
      // Безопасное получение avatarUrl
      let avatarUrl: string | null = null;
      try {
        const normalized = normalizeUserAvatar(message.sender);
        avatarUrl = normalized?.avatarUrl || message.sender.avatarUrl || null;
      } catch (avatarError) {
        console.warn('[chat] Error normalizing avatar:', avatarError);
        avatarUrl = message.sender.avatarUrl || null;
      }

      const normalizedMessage = {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        sender: {
          id: message.sender.id,
          firstName: message.sender.firstName || null,
          lastName: message.sender.lastName || null,
          middleName: null,
          avatarUrl: avatarUrl,
        },
        content: message.content,
        messageType: message.messageType,
        replyTo: message.replyTo && message.replyTo.sender
          ? (() => {
              try {
                let replyAvatarUrl: string | null = null;
                try {
                  replyAvatarUrl = normalizeUserAvatar(message.replyTo.sender).avatarUrl || null;
                } catch (avatarError) {
                  console.warn('[chat] Error normalizing reply avatar:', avatarError);
                  replyAvatarUrl = message.replyTo.sender.avatarUrl || null;
                }
                return {
                  id: message.replyTo.id,
                  content: message.replyTo.content || '',
                  sender: {
                    id: message.replyTo.sender.id,
                    firstName: message.replyTo.sender.firstName || null,
                    lastName: message.replyTo.sender.lastName || null,
                    avatarUrl: replyAvatarUrl,
                  },
                };
              } catch (replyError) {
                console.error('[chat] Error formatting replyTo:', replyError);
                return null;
              }
            })()
          : null,
        threadRootId: message.threadRootId,
        attachments: (message.attachments || []).map((att: any) => {
          // Определяем, является ли сообщение старым (старше 7 дней)
          const messageAge = Date.now() - new Date(message.createdAt).getTime();
          const isOld = messageAge > 7 * 24 * 60 * 60 * 1000; // 7 дней
          
          return {
            id: att.id,
            type: att.type,
            url: getFileUrlWithCDN(att.url, true), // Используем CDN URL
            name: att.name,
            size: att.size,
            mimeType: att.mimeType,
            thumbnailUrl: att.thumbnailUrl ? getFileUrlWithCDN(att.thumbnailUrl, true) : undefined,
            width: att.width,
            height: att.height,
            isOld, // Флаг для старых сообщений
          };
        }),
        reactions: {},
        createdAt: message.createdAt,
        editedAt: message.editedAt,
      };

      // Отправляем сообщение через WebSocket другим участникам
      try {
        // Используем формат комнаты chatId (без префикса chat:)
        console.log(`[chat/${chatId}] Emitting message via WebSocket:`, {
          messageId: normalizedMessage.id,
          chatId: normalizedMessage.chatId,
          senderId: normalizedMessage.senderId,
        });
        await emitNewMessage(chatId, normalizedMessage);
        console.log(`[chat/${chatId}] ✅ Message emitted via WebSocket to room: ${chatId}, messageId: ${normalizedMessage.id}`);
      } catch (wsError) {
        console.error(`[chat/${chatId}] ❌ Error emitting message via WebSocket:`, wsError);
        // Не прерываем выполнение, WebSocket - это дополнение
      }

      // Отправляем уведомления упомянутым пользователям
      const mentionedIds = Array.isArray(mentionedUserIds) ? mentionedUserIds : [];
      if (mentionedIds.length > 0) {
        try {
          const mentionedUsers = await prisma.user.findMany({
            where: {
              id: { in: mentionedIds },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          });

          const chatInfo = await prisma.chat.findUnique({
            where: { id: chatId },
            select: {
              name: true,
              type: true,
            },
          });

          const chatName = chatInfo?.name || 'Чат';
          const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Пользователь';
          const notificationContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
          // URL с переходом к конкретному сообщению
          const notificationUrl = `/dashboard/chat?chatId=${chatId}&messageId=${normalizedMessage.id}`;

          await Promise.allSettled(
            mentionedUsers.map(async (user) => {
              if (user.id === userId) return; // Не отправляем уведомление себе
              try {
                await sendUserNotification({
                  userId: user.id,
                  type: 'chat_mention',
                  title: `@${senderName} упомянул вас в "${chatName}"`,
                  body: notificationContent,
                  url: notificationUrl,
                  senderName: senderName,
                  metadata: {
                    chatId,
                    messageId: normalizedMessage.id,
                    mentioned: true,
                  },
                });
              } catch (err) {
                console.error(`[chat] Error sending mention notification to user ${user.id}:`, err);
              }
            })
          );
        } catch (mentionError) {
          console.error('[chat] Error processing mentions:', mentionError);
        }
      }

      // Отправляем уведомления другим участникам (push + запись в БД для раздела уведомлений)
      try {
        const participants = await prisma.chatParticipant.findMany({
          where: {
            chatId,
            userId: { not: userId },
            leftAt: null,
          },
          select: {
            userId: true,
          },
        });

        console.log(`[chat/${chatId}] Sending notifications to ${participants.length} participants:`, {
          participantIds: participants.map(p => p.userId),
          messageId: normalizedMessage.id,
        });

        if (participants.length > 0) {
          const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Пользователь';
          const notificationContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
          const notificationUrl = `/dashboard/chat?chatId=${chatId}`;

          // Отправляем уведомления каждому участнику через sendUserNotification
          // Это создаст записи в БД и отправит push-уведомления
          await Promise.allSettled(
            participants.map(async (participant) => {
              try {
                await sendUserNotification({
                  userId: participant.userId,
                  type: 'chat_message',
                  title: `Новое сообщение от ${senderName}`,
                  body: notificationContent,
                  url: notificationUrl,
                  senderName: senderName,
                  metadata: {
                    chatId,
                    messageId: normalizedMessage.id,
                  },
                });
              } catch (err) {
                console.error(`[chat] Error sending notification to user ${participant.userId}:`, err);
              }
            })
          );
        }
      } catch (notifError) {
        console.error('[chat] Error preparing notifications:', notifError);
        // Не прерываем выполнение
      }

      console.log(`[chat/${chatId}] ✅ Returning created message to client:`, {
        messageId: normalizedMessage.id,
        chatId: normalizedMessage.chatId,
        senderId: normalizedMessage.senderId,
        contentLength: normalizedMessage.content.length,
      });
      // КРИТИЧЕСКИ ВАЖНО: Инвалидируем кэш списка чатов для обновления lastMessage
      // ВАЖНО: Кэш сообщений отключен, но инвалидируем кэш списка чатов
      console.log(`[chat/${chatId}] Invalidating chat list cache after message creation`);
      try {
        const chatParticipants = await prisma.chatParticipant.findMany({
          where: { chatId, leftAt: null },
          select: { userId: true },
        });
        
        console.log(`[chat/${chatId}] Invalidating chat list cache for ${chatParticipants.length} participants`);
        await Promise.allSettled(
          chatParticipants.map(p => invalidateUserChatsCache(p.userId))
        ).catch(err => console.warn(`[chat/${chatId}] User chats cache invalidation error:`, err));
        
        // Также инвалидируем кэш данных чата (но не сообщений, т.к. они отключены)
        await invalidateChatCache(chatId).catch(err =>
          console.warn(`[chat/${chatId}] Chat cache invalidation error:`, err)
        );
      } catch (err) {
        console.warn(`[chat/${chatId}] Error invalidating cache:`, err);
      }

      console.log(`[chat/${chatId}] ✅ Returning created message to client:`, {
        messageId: normalizedMessage.id,
        chatId: normalizedMessage.chatId,
        senderId: normalizedMessage.senderId,
        contentLength: normalizedMessage.content.length,
      });
      return NextResponse.json({ message: normalizedMessage });
    } catch (formatError: any) {
      console.error('[chat] Error formatting message:', formatError);
      console.error('[chat] Format error stack:', formatError?.stack);
      // Возвращаем базовую структуру даже если форматирование не удалось
      return NextResponse.json({
        message: {
          id: message.id,
          chatId: message.chatId,
          senderId: message.senderId,
          content: message.content,
          messageType: message.messageType,
          createdAt: message.createdAt,
          sender: message.sender ? {
            id: message.sender.id,
            firstName: message.sender.firstName,
            lastName: message.sender.lastName,
            avatarUrl: message.sender.avatarUrl,
          } : null,
        },
      });
    }
  } catch (error: any) {
    Sentry.captureException(error);
    console.error('[chat] POST Error:', error);
    console.error('[chat] POST Error stack:', error?.stack);
    
    // Безопасное логирование деталей
    try {
      const resolvedParams = await Promise.resolve(params);
      const session = await getServerSession(authOptions);
      console.error('[chat] POST Error details:', {
        chatId: resolvedParams?.chatId,
        userId: session?.user?.id,
        errorMessage: error?.message,
        errorName: error?.name,
      });
    } catch (logError) {
      // Игнорируем ошибки логирования
    }
    
    return NextResponse.json(
      { 
        error: error?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/chat/[chatId]
 * Обновить групповой чат (название, описание, иконка, участники, админ)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;

    // Проверяем, что чат существует и является групповым
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

    if (!chat) {
      return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
    }

    if (chat.type !== ChatType.GROUP) {
      return NextResponse.json(
        { error: 'Можно редактировать только групповые чаты' },
        { status: 400 }
      );
    }

    // Проверяем, что пользователь является админом
    const currentParticipant = chat.participants.find(
      (p) => p.userId === session.user.id && p.role === 'admin'
    );

    if (!currentParticipant) {
      return NextResponse.json(
        { error: 'Только администратор может редактировать группу' },
        { status: 403 }
      );
    }

    const { name, description, iconUrl, participantIds, adminId } = await request.json();

    // Обновляем базовую информацию
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (iconUrl !== undefined) updateData.iconUrl = iconUrl || null;

    if (Object.keys(updateData).length > 0) {
      await prisma.chat.update({
        where: { id: chatId },
        data: updateData,
      });
    }

    // Обновляем участников если нужно
    if (participantIds && Array.isArray(participantIds)) {
      const currentParticipantIds = chat.participants.map((p) => p.userId);
      const newParticipantIds = [...new Set(participantIds)];

      // Добавляем новых участников
      const toAdd = newParticipantIds.filter((id) => !currentParticipantIds.includes(id));
      if (toAdd.length > 0) {
        const newMembers = await prisma.user.findMany({
          where: { id: { in: toAdd } },
          select: { id: true, firstName: true, lastName: true },
        });

        await prisma.chatParticipant.createMany({
          data: toAdd.map((userId: string) => ({
            chatId,
            userId,
            role: 'member',
            invitedById: session.user.id,
          })),
        });

        // Отправляем уведомления новым участникам
        const creatorName = chat.createdBy
          ? `${chat.createdBy.firstName || ''} ${chat.createdBy.lastName || ''}`.trim() || 'Пользователь'
          : 'Пользователь';
        const chatName = updateData.name || chat.name || 'группу';
        const notificationUrl = `/dashboard/chat?chatId=${chatId}`;

        await Promise.allSettled(
          newMembers.map(async (member) => {
            try {
              await sendUserNotification({
                userId: member.id,
                type: 'chat_message',
                title: '👥 Вас добавили в группу',
                body: `${creatorName} добавил вас в "${chatName}"`,
                url: notificationUrl,
                senderName: creatorName,
              });
            } catch (err) {
              console.error(`[chat] Error sending notification to user ${member.id}:`, err);
            }
          })
        );
      }

      // Удаляем участников (кроме админа)
      const toRemove = currentParticipantIds.filter(
        (id) => !newParticipantIds.includes(id) && id !== adminId
      );
      if (toRemove.length > 0) {
        await prisma.chatParticipant.updateMany({
          where: {
            chatId,
            userId: { in: toRemove },
            role: { not: 'admin' }, // Не удаляем админа
          },
          data: {
            leftAt: new Date(),
          },
        });
      }
    }

    // Меняем админа если нужно
    if (adminId && adminId !== currentParticipant.userId) {
      const newAdmin = chat.participants.find((p) => p.userId === adminId);
      if (newAdmin) {
        // Старый админ становится участником
        await prisma.chatParticipant.updateMany({
          where: {
            chatId,
            userId: currentParticipant.userId,
            role: 'admin',
          },
          data: {
            role: 'member',
          },
        });

        // Новый админ
        await prisma.chatParticipant.updateMany({
          where: {
            chatId,
            userId: adminId,
          },
          data: {
            role: 'admin',
          },
        });
      }
    }

    // Инвалидируем кэш чата и списка чатов для всех участников
    await invalidateChatCache(chatId).catch(err => 
      console.warn('[chat] Cache invalidation error:', err)
    );
    
    const allParticipantIds = chat.participants.map(p => p.userId);
    if (participantIds && Array.isArray(participantIds)) {
      const newParticipantIds = [...new Set(participantIds)];
      const allIds = [...new Set([...allParticipantIds, ...newParticipantIds])];
      await Promise.allSettled(
        allIds.map(id => invalidateUserChatsCache(id))
      ).catch(err => console.warn('[chat] Cache invalidation error:', err));
    } else {
      await Promise.allSettled(
        allParticipantIds.map(id => invalidateUserChatsCache(id))
      ).catch(err => console.warn('[chat] Cache invalidation error:', err));
    }

    // Возвращаем обновленный чат
    const updatedChat = await prisma.chat.findUnique({
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
            avatarUrl: true,
          },
        },
      },
    });

    return NextResponse.json({ chat: updatedChat });
  } catch (error: any) {
    console.error('[chat] PATCH Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Ошибка обновления группы' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/[chatId]
 * Полностью удалить чат (только для создателя группы/канала, без привязки к обращению).
 * Личные чаты не удаляются этим методом — используйте POST /api/chat/[chatId]/leave.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        ticket: { select: { id: true } },
        participants: { where: { leftAt: null }, select: { userId: true } },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
    }

    if (chat.type !== 'GROUP' && chat.type !== 'CHANNEL') {
      return NextResponse.json(
        { error: 'Полное удаление доступно только для групп и каналов. Для личного чата используйте «Удалить переписку».' },
        { status: 400 }
      );
    }

    if (chat.createdById !== userId) {
      return NextResponse.json(
        { error: 'Удалить чат может только создатель' },
        { status: 403 }
      );
    }

    if (chat.ticket) {
      return NextResponse.json(
        { error: 'Нельзя удалить чат, связанный с обращением' },
        { status: 400 }
      );
    }

    await prisma.chat.delete({
      where: { id: chatId },
    });

    const participantIds = chat.participants.map((p) => p.userId).filter(Boolean) as string[];
    await Promise.allSettled(
      participantIds.map((id) => invalidateUserChatsCache(id))
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Чат удалён',
    });
  } catch (error: any) {
    console.error('[chat] DELETE Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Ошибка удаления чата' },
      { status: 500 }
    );
  }
}
