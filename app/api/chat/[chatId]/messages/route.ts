import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireChatAccess, ChatAccessError } from '@/lib/chat-service';
import { normalizeUserAvatar } from '@/lib/api-helpers';
import * as Sentry from '@sentry/nextjs';

/**
 * GET /api/chat/[chatId]/messages
 * Получить сообщения чата
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

    // Параметры запроса
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const threadRootId = searchParams.get('threadRootId');

    // Условие WHERE
    const where: any = {
      chatId,
    };

    if (threadRootId) {
      where.threadRootId = threadRootId;
    } else {
      where.threadRootId = null; // Только основные сообщения
    }

    // Загружаем сообщения
    const messages = await prisma.chatMessage.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'asc' },
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
        reactions: {
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
        readBy: {
          where: { userId },
          select: { id: true },
        },
        _count: {
          select: {
            threadReplies: true,
          },
        },
      },
    });

    // Форматируем сообщения
    const formattedMessages = messages.map(msg => {
      // Группируем реакции по emoji
      const reactions: Record<string, { count: number; userIds: string[] }> = {};
      msg.reactions.forEach(reaction => {
        if (!reactions[reaction.emoji]) {
          reactions[reaction.emoji] = {
            count: 0,
            userIds: [],
          };
        }
        reactions[reaction.emoji].count++;
        reactions[reaction.emoji].userIds.push(reaction.userId);
      });

      return {
        id: msg.id,
        senderId: msg.senderId,
        sender: normalizeUserAvatar(msg.sender),
        content: msg.content,
        messageType: msg.messageType,
        replyTo: msg.replyTo
          ? {
              id: msg.replyTo.id,
              sender: normalizeUserAvatar(msg.replyTo.sender),
              content: msg.replyTo.content,
            }
          : null,
        threadRootId: msg.threadRootId,
        threadRepliesCount: msg._count.threadReplies,
        reactions,
        attachments: msg.attachments.map(att => ({
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size,
          mimeType: att.mimeType,
          thumbnailUrl: att.thumbnailUrl,
        })),
        createdAt: msg.createdAt,
        editedAt: msg.editedAt,
        isRead: msg.readBy.length > 0,
      };
    });

    return NextResponse.json({ messages: formattedMessages });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error('[chat] GET messages Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
