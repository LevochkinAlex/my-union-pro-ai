import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireChatAccess, ChatAccessError } from '@/lib/chat-service';
import { normalizeUserAvatar } from '@/lib/api-helpers';
import * as Sentry from '@sentry/nextjs';
import { sendUserNotification } from '@/lib/notifications';
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

    // Загружаем чат
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
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
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
      attachments: (msg.attachments || []).map((att: any) => ({
        id: att.id,
        type: att.type,
        url: att.url,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        thumbnailUrl: att.thumbnailUrl,
        width: att.width,
        height: att.height,
      })),
      threadRepliesCount: msg._count?.threadReplies || 0,
      };
    }).filter((msg: any) => msg !== null);

    return NextResponse.json({
      chat,
      messages: formattedMessages,
      pagination: {
        hasMore,
        oldestMessageId: formattedMessages.length > 0 ? formattedMessages[0].id : null,
        newestMessageId: formattedMessages.length > 0 ? formattedMessages[formattedMessages.length - 1].id : null,
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

    const { content, replyToId, threadRootId, attachments } = body;

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

    // Проверяем threadRootId
    if (threadRootId) {
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
        attachments: (message.attachments || []).map((att: any) => ({
          id: att.id,
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size,
          mimeType: att.mimeType,
          thumbnailUrl: att.thumbnailUrl,
          width: att.width,
          height: att.height,
        })),
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
