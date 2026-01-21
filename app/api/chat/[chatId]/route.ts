import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireChatAccess, ChatAccessError } from '@/lib/chat-service';
import { normalizeUserAvatar } from '@/lib/api-helpers';
import * as Sentry from '@sentry/nextjs';

/**
 * GET /api/chat/[chatId]
 * Получить информацию о чате
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

    try {
      await requireChatAccess(chatId, session.user.id);
    } catch (error) {
      if (error instanceof ChatAccessError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

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

    return NextResponse.json({ chat });
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

    const body = await request.json();
    const { content, replyToId, threadRootId, attachments } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: 'Message cannot be empty' },
        { status: 400 }
      );
    }

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
    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: userId,
        content: content.trim(),
        messageType: 'text',
        replyToId: replyToId || null,
        threadRootId: threadRootId || null,
        attachments: attachments
          ? {
              create: attachments.map((att: any) => ({
                type: att.type || 'file',
                url: att.url,
                name: att.name,
                size: att.size,
                mimeType: att.mimeType,
                thumbnailUrl: att.thumbnailUrl,
                width: att.width,
                height: att.height,
              })),
            }
          : undefined,
      },
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

    // Обновляем последнее сообщение в чате
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageId: message.id,
        lastMessageAt: message.createdAt,
      },
    });

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
    const normalizedMessage = {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sender: normalizeUserAvatar(message.sender),
      content: message.content,
      messageType: message.messageType,
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            sender: normalizeUserAvatar(message.replyTo.sender),
            content: message.replyTo.content,
          }
        : null,
      threadRootId: message.threadRootId,
      attachments: message.attachments || [],
      reactions: {},
      createdAt: message.createdAt,
      editedAt: message.editedAt,
    };

    return NextResponse.json({ message: normalizedMessage });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error('[chat] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
