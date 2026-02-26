import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHead, getPPOHead } from "@/lib/ppo-head-utils";
import { isDemoUserId } from "@/lib/demo";
import { getDemoNews } from "@/lib/demo";
import { getOrCreateRegionalNewsChannel } from "@/lib/regional-news";

/**
 * GET /api/ppo-head/news
 * Получить список новостей для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Демо: мок-новости без БД (формат как у обычного ответа — { news: [...] })
    if (isDemoUserId(session.user.id)) {
      const demoNews = getDemoNews(50);
      const news = demoNews.map((post: any) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        coverImage: post.coverImage,
        publishedAt: post.publishedAt,
        viewCount: post.viewCount,
        author: post.author ?? { id: "demo", firstName: "Председатель", lastName: "ППО", email: "", avatarUrl: null },
        channel: post.channel ?? { id: "demo", name: "Новости", iconUrl: null },
        _count: post._count ?? { likes: 0, comments: 0 },
        isLiked: post.isLiked ?? false,
        polls: post.polls ?? [],
      }));
      return NextResponse.json({ news });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const regionalChannel = await getOrCreateRegionalNewsChannel(session.user.id);

    // Получаем каналы организации
    const channels = await prisma.newsChannel.findMany({
      where: {
        organizationId: chairman.organizationId,
      },
      select: {
        id: true,
      },
    });

    const channelIds = [regionalChannel.id, ...channels.map((ch) => ch.id)];

    // Получаем новости из каналов организации
    const news = await prisma.newsPost.findMany({
      where: {
        channelId: {
          in: channelIds,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            iconUrl: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        polls: {
          include: {
            votes: {
              where: {
                userId: session.user.id,
              },
              select: {
                optionId: true,
              },
            },
            _count: {
              select: {
                votes: true,
              },
            },
          },
        },
        likes: {
          where: {
            userId: session.user.id,
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Получаем статистику по всем опросам
    const pollIds = news.flatMap((n) => n.polls.map((p) => p.id));
    let pollStats: Record<string, { optionId: string; count: number }[]> = {};
    
    if (pollIds.length > 0) {
      const allVotes = await prisma.newsPollVote.groupBy({
        by: ["pollId", "optionId"],
        where: {
          pollId: { in: pollIds },
        },
        _count: {
          optionId: true,
        },
      });
      
      pollStats = allVotes.reduce((acc, vote) => {
        if (!acc[vote.pollId]) {
          acc[vote.pollId] = [];
        }
        acc[vote.pollId].push({
          optionId: vote.optionId,
          count: vote._count.optionId,
        });
        return acc;
      }, {} as Record<string, { optionId: string; count: number }[]>);
    }

    return NextResponse.json({
      news: news.map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        coverImage: post.coverImage,
        publishedAt: post.publishedAt?.toISOString() || null,
        viewCount: post.viewCount,
        author: post.author,
        channel: post.channel,
        _count: post._count,
        isLiked: post.likes.length > 0,
        polls: post.polls.map((poll) => {
          const options = poll.options as Array<{ id: string; text: string }>;
          const stats = pollStats[poll.id] || [];
          const totalVotes = stats.reduce((sum, s) => sum + s.count, 0);
          
          return {
            id: poll.id,
            question: poll.question,
            options: options.map((option) => {
              const voteCount = stats.find((s) => s.optionId === option.id)?.count || 0;
              const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 1000) / 10 : 0;
              
              return {
                ...option,
                voteCount,
                percentage,
              };
            }),
            totalVotes,
            userVote: poll.votes[0]?.optionId || null,
            isClosed: poll.isClosed,
          };
        }),
      })),
    });
  } catch (error: any) {
    console.error("[ppo-head/news] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении новостей",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ppo-head/news
 * Создать новую новость
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { title, content, coverImage, channelId, isPublished, polls } = await request.json();

    if (!title || !content || !channelId) {
      return NextResponse.json(
        { error: "Заголовок, содержание и канал обязательны" },
        { status: 400 }
      );
    }

    // Проверяем, что канал принадлежит организации Председателя
    const channel = await prisma.newsChannel.findUnique({
      where: { id: channelId },
      select: { id: true, organizationId: true, name: true },
    });
    if (!channel) {
      return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
    }

    const isRegionalChannel = channel.organizationId === null && channel.name === "Региональные новости";
    if (isRegionalChannel) {
      const orgHead = await getOrgHead(session.user.id);
      if (!orgHead || orgHead.level !== "RPO") {
        return NextResponse.json(
          { error: "Публикация в региональный канал доступна только РПО" },
          { status: 403 }
        );
      }
    } else if (channel.organizationId !== chairman.organizationId) {
      return NextResponse.json(
        { error: "Канал не найден или не принадлежит вашей организации" },
        { status: 403 }
      );
    }

    // Создаем новость
    const newsPost = await prisma.newsPost.create({
      data: {
        authorId: chairman.id,
        channelId,
        title: title.trim(),
        content: content.trim(),
        coverImage: coverImage || null,
        isPublished: Boolean(isPublished),
        publishedAt: isPublished ? new Date() : null,
        polls: polls && polls.length > 0 ? {
          create: polls.map((poll: any) => ({
            question: poll.question,
            options: poll.options.map((opt: any) => ({ id: opt.id, text: opt.text })),
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
            email: true,
            avatarUrl: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            iconUrl: true,
          },
        },
        polls: {
          select: {
            id: true,
          },
        },
      },
    });

    // Синхронизируем с чатом: создаем ChatMessage в канале, если канал связан с Chat
    try {
      const channelChat = await prisma.chat.findUnique({
        where: { newsChannelId: channelId },
        select: { id: true },
      });

      if (channelChat) {
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
            chatId: channelChat.id,
            senderId: chairman.id,
            content: messageContent,
            messageType: "channel_post",
          },
        });

        // Обновляем lastMessage в чате
        await prisma.chat.update({
          where: { id: channelChat.id },
          data: {
            lastMessageId: message.id,
            lastMessageAt: new Date(),
          },
        });

        // Отправляем через WebSocket
        try {
          const { emitNewMessage } = await import("@/server/socket");
          const { normalizeUserAvatar } = await import("@/lib/api-helpers");
          
          const sender = await prisma.user.findUnique({
            where: { id: chairman.id },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          });

          if (sender) {
            const normalizedSender = normalizeUserAvatar(sender);
            await emitNewMessage(channelChat.id, {
              id: message.id,
              chatId: channelChat.id,
              senderId: chairman.id,
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
            });
          }
        } catch (wsError) {
          console.error("[ppo-head/news] WebSocket error:", wsError);
          // Не прерываем выполнение, если WebSocket не работает
        }
      }
    } catch (chatError) {
      console.error("[ppo-head/news] Chat sync error:", chatError);
      // Не прерываем выполнение, если синхронизация с чатом не удалась
    }

    return NextResponse.json({ news: newsPost }, { status: 201 });
  } catch (error: any) {
    console.error("[ppo-head/news] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при создании новости",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

