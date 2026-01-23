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

    // Проверяем viewMode пользователя - в режиме участника нельзя создавать посты
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
        { error: "В режиме участника нельзя создавать посты в каналах. Переключитесь в режим председателя." },
        { status: 403 }
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
        _count: {
          select: {
            likes: true,
            comments: true,
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

    // Получаем лайк пользователя для поста
    const userLike = await prisma.newsLike.findUnique({
      where: {
        newsPostId_userId: {
          newsPostId: newsPost.id,
          userId: userId,
        },
      },
    });

    // Получаем голоса пользователя в опросах
    const pollIds = newsPost.polls?.map(p => p.id) || [];
    let userPollVotes: Record<string, string> = {};
    if (pollIds.length > 0) {
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

    // Получаем статистику голосов для каждого опроса
    const pollsWithStats = await Promise.all(
      (newsPost.polls || []).map(async (poll) => {
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
        polls: pollsWithStats,
        _count: {
          likes: newsPost._count?.likes || 0,
          comments: newsPost._count?.comments || 0,
        },
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

    // Функция для очистки HTML тегов
    const stripHtml = (html: string): string => {
      return html
        .replace(/<[^>]*>/g, '') // Удаляем все HTML теги
        .replace(/&nbsp;/g, ' ') // Заменяем &nbsp; на пробел
        .replace(/&amp;/g, '&') // Заменяем &amp; на &
        .replace(/&lt;/g, '<') // Заменяем &lt; на <
        .replace(/&gt;/g, '>') // Заменяем &gt; на >
        .replace(/&quot;/g, '"') // Заменяем &quot; на "
        .replace(/&#39;/g, "'") // Заменяем &#39; на '
        .replace(/\s+/g, ' ') // Убираем множественные пробелы
        .trim();
    };

    await Promise.allSettled(
      allParticipants.map(async (p) => {
        try {
          await sendUserNotification({
            userId: p.userId,
            type: "chat_message",
            title: `📢 Новый пост в канале "${channelName}"`,
            body: stripHtml(title),
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
