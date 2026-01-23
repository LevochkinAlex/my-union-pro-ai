import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireChatAccess, ChatAccessError } from '@/lib/chat-service';
import { normalizeUserAvatar } from '@/lib/api-helpers';
import { getFileUrlWithCDN } from '@/lib/cdn';
import * as Sentry from '@sentry/nextjs';
import { sendUserNotification } from '@/lib/notifications';
import { 
  invalidateChatCache, 
  invalidateUserChatsCache,
  cacheChatMessages,
  getCachedChatMessages,
  cacheChatData,
  getCachedChatData,
} from '@/lib/chat-redis';
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

    try {
      await requireChatAccess(chatId, session.user.id);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Пытаемся получить кэшированные данные чата
    let chat = await getCachedChatData(chatId);
    
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

    // Пытаемся получить кэшированные сообщения
    const cachedMessages = await getCachedChatMessages(chatId, cursor || undefined, direction);
    
    if (cachedMessages) {
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
        reactions: true,
        attachments: true,
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
    // Получаем newsChannelId отдельным запросом, если нужно
    let newsChannelId: string | null = null;
    if ((chat.type as string) === 'CHANNEL') {
      const channelWithNews = await prisma.$queryRaw<Array<{ newsChannelId: string | null }>>`
        SELECT "newsChannelId" FROM "Chat" WHERE id = ${chatId}
      `;
      newsChannelId = channelWithNews[0]?.newsChannelId || null;
    }
    
    if ((chat.type as string) === 'CHANNEL' && newsChannelId) {
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
      });

      // Добавляем посты, которых еще нет в сообщениях
      for (const post of channelPosts) {
        if (!existingPostIds.has(post.id)) {
          postIds.push(post.id);
        }
      }
    }

    // Загружаем данные постов одним запросом
    const postsMap = new Map<string, any>();
    const postsAuthorsMap = new Map<string, any>(); // Отдельная карта для авторов
    if (postIds.length > 0) {
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

      // Получаем статистику голосов для каждого опроса
      for (const post of posts) {
        const pollsWithStats = await Promise.all(
          post.polls.map(async (poll) => {
            const votes = await prisma.newsPollVote.groupBy({
              by: ["optionId"],
              where: {
                pollId: poll.id,
              },
              _count: {
                optionId: true,
              },
            });

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
    }

    // Форматируем сообщения
    const formattedMessages = resultMessages.map((msg: any) => {
      // Проверяем что sender существует
      if (!msg.sender) {
        console.error('[chat] Message without sender:', msg.id);
        return null;
      }
      
      // Проверяем, прочитано ли сообщение другими участниками
      // Для своих сообщений: прочитано, если все другие участники прочитали
      const isOwnMessage = msg.senderId === userId;
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
      
      return {
      id: msg.id,
      chatId: msg.chatId,
      senderId: msg.senderId,
      content: msg.content,
      messageType: msg.messageType,
      createdAt: msg.createdAt,
      editedAt: msg.editedAt,
      isRead, // Статус прочтения для своих сообщений
      sender: {
        id: msg.sender.id,
        firstName: msg.sender.firstName,
        lastName: msg.sender.lastName,
        middleName: msg.sender.middleName,
        avatarUrl: normalizeUserAvatar(msg.sender)?.avatarUrl || null,
      },
      replyTo: msg.replyTo && msg.replyTo.sender ? {
        id: msg.replyTo.id,
        content: msg.replyTo.content,
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
        // Определяем, является ли сообщение старым (старше 7 дней)
        const messageAge = Date.now() - new Date(msg.createdAt).getTime();
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
      threadRepliesCount: msg._count?.threadReplies || 0,
      // Данные поста для channel_post
      post: postData,
      };
    }).filter((msg: any) => msg !== null);

    // Для каналов: добавляем виртуальные сообщения для постов из NewsChannel,
    // которые еще не созданы как сообщения в чате
    if ((chat.type as string) === 'CHANNEL' && newsChannelId && postsMap.size > 0) {
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

      // Кэшируем сообщения для следующих запросов
      await cacheChatMessages(chatId, formattedMessages, cursor || undefined, direction).catch(err =>
        console.warn('[chat] Cache error:', err)
      );

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

    // Кэшируем сообщения для следующих запросов
    await cacheChatMessages(chatId, formattedMessages, cursor || undefined, direction).catch(err =>
      console.warn('[chat] Cache error:', err)
    );

    // Логируем для отладки обращений
    if (chat.ticket) {
      console.log(`[chat] Загружено сообщений для обращения ${chat.ticket.publicId}: обычных: ${formattedMessages.length}, системных: ${activityMessages.length}, всего: ${allMessages.length}`);
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
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: { userId, leftAt: null },
        },
      },
    });

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

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

    const message = await prisma.chatMessage.create({
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

    // Обновляем последнее сообщение в чате и онлайн статус отправителя
    try {
      await Promise.allSettled([
        prisma.chat.update({
          where: { id: chatId },
          data: {
            lastMessageId: message.id,
            lastMessageAt: message.createdAt,
          },
        }),
        // Обновляем онлайн статус отправителя
        prisma.user.update({
          where: { id: userId },
          data: {
            updatedAt: new Date(),
          },
        }),
      ]);
    } catch (updateError) {
      // Логируем но не прерываем выполнение
      console.warn('[chat] Error updating chat/user:', updateError);
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
        await emitNewMessage(chatId, normalizedMessage);
        console.log('[chat] Message emitted via WebSocket to room:', chatId, normalizedMessage.id);
      } catch (wsError) {
        console.error('[chat] Error emitting message via WebSocket:', wsError);
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
