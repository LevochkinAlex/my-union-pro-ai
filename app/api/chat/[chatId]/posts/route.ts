import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireChatAccess } from "@/lib/chat-service";
import { sendUserNotification } from "@/lib/notifications";
import { invalidateChatCache, invalidateUserChatsCache } from "@/lib/chat-redis";
import { emitNewMessage } from "@/server/socket";
import { normalizeUserAvatar } from "@/lib/api-helpers";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/chat/[chatId]/posts
 * Создать пост в канале (с заголовком, картинкой, голосованием)
 */
export async function POST(
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
      if (error.message?.includes("доступ")) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    // Получаем чат и проверяем, что это канал
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          where: { userId, leftAt: null },
        },
        newsChannel: true,
      },
    });

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (chat.type !== "CHANNEL") {
      return NextResponse.json(
        { error: "Посты можно создавать только в каналах" },
        { status: 400 }
      );
    }

    // Проверяем, что пользователь - админ канала
    const participant = chat.participants[0];
    if (!participant || participant.role !== "admin") {
      return NextResponse.json(
        { error: "Только председатель может создавать посты в канале" },
        { status: 403 }
      );
    }

    if (!chat.newsChannelId || !chat.newsChannel) {
      return NextResponse.json(
        { error: "Канал не связан с NewsChannel" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, content, coverImage, polls, isPublished = true } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Заголовок и содержание обязательны" },
        { status: 400 }
      );
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
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Создаем NewsPost
    const newsPost = await prisma.newsPost.create({
      data: {
        authorId: userId,
        channelId: chat.newsChannelId,
        title: title.trim(),
        content: content.trim(),
        coverImage: coverImage || null,
        isPublished: Boolean(isPublished),
        publishedAt: isPublished ? new Date() : null,
        polls: polls && Array.isArray(polls) && polls.length > 0 ? {
          create: polls.map((poll: any) => ({
            question: poll.question || "Опрос",
            options: Array.isArray(poll.options) 
              ? poll.options.map((opt: any) => ({ 
                  id: opt.id || String(Math.random()), 
                  text: opt.text || "" 
                }))
              : [],
            isClosed: poll.isClosed || false,
            closesAt: poll.closesAt ? new Date(poll.closesAt) : null,
          })),
        } : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
      },
    });

    // Создаем ChatMessage для отображения в чате
    // Формируем контент сообщения с метаданными поста
    const messageContent = JSON.stringify({
      type: "channel_post",
      postId: newsPost.id,
      title: newsPost.title,
      content: newsPost.content,
      coverImage: newsPost.coverImage,
      hasPolls: (newsPost.polls?.length || 0) > 0,
    });

    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderId: userId,
        content: messageContent,
        messageType: "channel_post",
        // Сохраняем связь с постом через метаданные в content
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
      },
    });

    // Обновляем lastMessage в чате
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageId: message.id,
        lastMessageAt: new Date(),
      },
    });

    // Нормализуем аватар отправителя
    const normalizedSender = normalizeUserAvatar(message.sender);

    // Формируем ответ
    const normalizedMessage = {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sender: {
        id: normalizedSender.id,
        firstName: normalizedSender.firstName,
        lastName: normalizedSender.lastName,
        avatarUrl: normalizedSender.avatarUrl,
      },
      content: messageContent,
      messageType: "channel_post",
      createdAt: message.createdAt,
      editedAt: null,
      replyTo: null,
      replyToId: null,
      reactions: {},
      attachments: [],
      threadRepliesCount: 0,
      // Метаданные поста
      post: {
        id: newsPost.id,
        title: newsPost.title,
        content: newsPost.content,
        coverImage: newsPost.coverImage,
        polls: newsPost.polls?.map((poll) => ({
          id: poll.id,
          question: poll.question,
          options: poll.options as Array<{ id: string; text: string }>,
          totalVotes: poll._count.votes,
          isClosed: poll.isClosed,
        })) || [],
      },
    };

    // Отправляем через WebSocket
    await emitNewMessage(chatId, normalizedMessage);

    // Отправляем уведомления всем участникам канала
    const allParticipants = await prisma.chatParticipant.findMany({
      where: {
        chatId,
        leftAt: null,
        userId: { not: userId }, // Исключаем автора
      },
      select: { userId: true },
    });

    const senderName = `${sender.firstName || ""} ${sender.lastName || ""}`.trim() || "Председатель";
    const channelName = chat.name || "канал";

    await Promise.allSettled(
      allParticipants.map(async (p) => {
        try {
          await sendUserNotification({
            userId: p.userId,
            type: "chat_message",
            title: `📢 Новый пост в канале "${channelName}"`,
            body: title,
            url: `/dashboard/chat?chatId=${chatId}`,
            senderName,
            metadata: {
              chatId,
              messageId: message.id,
              postId: newsPost.id,
            },
          });
        } catch (err) {
          console.error(`[chat/posts] Error sending notification to user ${p.userId}:`, err);
        }
      })
    );

    // Инвалидируем кэш
    await Promise.allSettled([
      invalidateChatCache(chatId),
      ...allParticipants.map((p) => invalidateUserChatsCache(p.userId)),
    ]).catch((err) => console.warn("[chat/posts] Cache invalidation error:", err));

    return NextResponse.json({
      message: normalizedMessage,
      post: newsPost,
    });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error("[chat/posts] POST Error:", error);
    return NextResponse.json(
      {
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}
