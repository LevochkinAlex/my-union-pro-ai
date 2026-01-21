/**
 * GET /api/chat/[chatId]/messages
 * Получить сообщения чата с поддержкой тредов
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireChatAccess } from "@/lib/chat-service";

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } | Promise<{ chatId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const chatId = resolvedParams.chatId;
    const userId = session.user.id;

    // Проверяем доступ
    try {
      await requireChatAccess(chatId, userId);
    } catch (error: any) {
      return NextResponse.json({ error: error.message || "Нет доступа к чату" }, { status: 403 });
    }

    // Параметры запроса
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const cursor = searchParams.get("cursor");
    const threadRootId = searchParams.get("threadRootId"); // Для загрузки тредов

    // Строим условие WHERE
    const where: any = {
      chatId,
    };

    // Если запрашивается тред, загружаем только ответы в треде
    if (threadRootId) {
      where.threadRootId = threadRootId;
    } else {
      // Основные сообщения (не в тредах)
      where.threadRootId = null;
    }

    // Курсор для пагинации
    if (cursor) {
      where.id = { lt: cursor }; // Для загрузки более старых сообщений
    }

    // Получаем сообщения
    const messages = await prisma.chatMessage.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
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
                avatarUrl: true,
              },
            },
          },
        },
        readBy: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            threadReplies: true, // Количество ответов в треде (только для корневых сообщений)
            readBy: true,
          },
        },
      },
    });

    // Форматируем ответы
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      chatId: msg.chatId,
      sender: {
        id: msg.sender.id,
        firstName: msg.sender.firstName,
        lastName: msg.sender.lastName,
        middleName: msg.sender.middleName,
        avatarUrl: msg.sender.avatarUrl,
      },
      content: msg.content,
      messageType: msg.messageType,
      replyTo: msg.replyTo
        ? {
            id: msg.replyTo.id,
            sender: {
              id: msg.replyTo.sender.id,
              firstName: msg.replyTo.sender.firstName,
              lastName: msg.replyTo.sender.lastName,
            },
            content: msg.replyTo.content,
          }
        : null,
      threadRootId: msg.threadRootId,
      threadRepliesCount: msg.threadRootId === null ? msg.threadRepliesCount : 0, // Только для корневых сообщений
      threadLastReplyAt: msg.threadRootId === null ? msg.threadLastReplyAt : null,
      attachments: msg.attachments,
      reactions: (() => {
        // Группируем реакции по эмодзи
        const grouped = msg.reactions.reduce((acc, r) => {
          if (!acc[r.emoji]) {
            acc[r.emoji] = {
              emoji: r.emoji,
              count: 0,
              users: [],
            };
          }
          acc[r.emoji].count++;
          acc[r.emoji].users.push(r.user.id);
          return acc;
        }, {} as Record<string, { emoji: string; count: number; users: string[] }>);
        return Object.values(grouped);
      })(),
      readByCount: msg._count.readBy,
      isRead: msg.readBy?.some((r) => r.userId === userId) || false,
      editedAt: msg.editedAt,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    }));

    // Определяем следующий курсор
    const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;

    return NextResponse.json({
      messages: formattedMessages.reverse(), // Возвращаем в хронологическом порядке
      nextCursor,
      hasMore: !!nextCursor,
    });
  } catch (error: any) {
    console.error("[GET /api/chat/[chatId]/messages] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка загрузки сообщений" },
      { status: 500 }
    );
  }
}
