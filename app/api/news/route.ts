import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCache, getCacheKey } from "@/lib/cache";
import { isDemoUserId } from "@/lib/demo";
import { getDemoNews } from "@/lib/demo";
import { getOrCreateRegionalNewsChannel } from "@/lib/regional-news";
import { normalizeCoverImageForDisplay } from "@/lib/cdn";

// GET /api/news - получить список опубликованных новостей
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const channelId = searchParams.get("channelId") || null;
    const skip = (page - 1) * limit;

    // Демо-режим: мок-новости без БД (must be before any Prisma call)
    if (session?.user?.id && isDemoUserId(session.user.id)) {
      const allDemo = getDemoNews(limit * 5);
      const total = allDemo.length;
      const news = allDemo.slice(skip, skip + limit).map((post: any) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        coverImage: post.coverImage,
        publishedAt: post.publishedAt,
        viewCount: post.viewCount,
        author: post.author,
        _count: post._count ?? { likes: 0, comments: 0 },
        isLiked: post.isLiked ?? false,
        polls: post.polls ?? [],
      }));
      return NextResponse.json({
        news,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      });
    }

    // Организация пользователя: член ППО или председатель (чтобы видеть новости своей org + региональные)
    let userOrganizationId: string | null = null;
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          organizationId: true,
          ppoHeadOrganizationId: true,
          mpoHeadOrganizationId: true,
          rpoHeadOrganizationId: true,
        },
      });
      userOrganizationId =
        user?.organizationId ||
        user?.ppoHeadOrganizationId ||
        user?.mpoHeadOrganizationId ||
        user?.rpoHeadOrganizationId ||
        null;
      await getOrCreateRegionalNewsChannel(session.user.id);
    }

    // Проверяем доступ к каналу, если передан channelId
    let allowedChannelId: string | null = null;
    if (channelId && session?.user?.id) {
      const channel = await prisma.newsChannel.findUnique({
        where: { id: channelId },
        select: { id: true, organizationId: true, name: true },
      });
      if (channel) {
        const isOrgChannel = userOrganizationId && channel.organizationId === userOrganizationId;
        const isRegional = channel.organizationId === null && channel.name === "Региональные новости";
        if (isOrgChannel || isRegional) allowedChannelId = channel.id;
      }
    }

    const whereClause: any = {
      isPublished: true,
    };
    if (allowedChannelId) {
      whereClause.channelId = allowedChannelId;
    } else if (userOrganizationId) {
      whereClause.OR = [
        { channel: { organizationId: userOrganizationId } },
        { channel: { organizationId: null, name: "Региональные новости" } },
      ];
    } else {
      whereClause.OR = [
        { channelId: null },
        { channel: { organizationId: null } },
      ];
    }

    const fetchNews = async (): Promise<{ news: any[]; total: number }> => {
      const [newsRaw, total] = await Promise.all([
        prisma.newsPost.findMany({
          where: whereClause,
          select: {
            id: true,
            title: true,
            content: true,
            coverImage: true,
            publishedAt: true,
            viewCount: true,
            channel: {
              select: { id: true, name: true, organizationId: true },
            },
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                rpoHeadOrganization: {
                  select: { name: true },
                },
              },
            },
            _count: {
              select: {
                likes: true,
                comments: true,
              },
            },
            polls: {
              select: {
                id: true,
                question: true,
                options: true,
                isClosed: true,
                _count: {
                  select: {
                    votes: true,
                  },
                },
              },
            },
          },
          orderBy: { publishedAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.newsPost.count({ where: whereClause }),
      ]);
      const isRegionalChannel = (ch: { organizationId: string | null; name: string } | null) =>
        ch && ch.organizationId === null && ch.name === "Региональные новости";
      const news = newsRaw.map(n => {
        const { channel, ...rest } = n;
        const authorDisplayName =
          isRegionalChannel(channel) && (n.author as any)?.rpoHeadOrganization?.name
            ? (n.author as any).rpoHeadOrganization.name
            : null;
        return {
          ...rest,
          content: (n as any).content || '',
          coverImage: normalizeCoverImageForDisplay(n.coverImage) ?? n.coverImage,
          authorDisplayName,
        };
      });
      return { news, total };
    };

    // При выборе канала (в т.ч. «Региональные новости») не кешируем — всегда актуальный список
    let cachedData: { news: any[]; total: number };
    try {
      if (allowedChannelId) {
        cachedData = await fetchNews();
      } else {
        const cacheKey = getCacheKey("news:list", { page, limit, orgId: userOrganizationId });
        cachedData = await withCache(cacheKey, fetchNews, 120);
      }
    } catch (cacheError) {
      console.error("[api/news] Cache error, loading directly:", cacheError);
      cachedData = await fetchNews();
    }
    
    const { news, total } = cachedData;

    // Если пользователь авторизован, получаем его лайки
    let userLikes: string[] = [];
    if (session?.user?.id) {
      const likes = await prisma.newsLike.findMany({
        where: {
          userId: session.user.id,
          newsPostId: {
            in: news.map((n) => n.id),
          },
        },
        select: {
          newsPostId: true,
        },
      });
      userLikes = likes.map((l) => l.newsPostId);
    }

    // Получаем статистику по всем опросам и голоса пользователя
    const pollIds = news.flatMap((n) => n.polls.map((p) => p.id));
    
    let userPollVotes: Record<string, string> = {};
    let pollStats: Record<string, { optionId: string; count: number }[]> = {};
    
    if (pollIds.length > 0) {
      // Получаем статистику голосов по всем опросам
      const allVotes = await prisma.newsPollVote.groupBy({
        by: ["pollId", "optionId"],
        where: {
          pollId: { in: pollIds },
        },
        _count: {
          optionId: true,
        },
      });
      
      // Группируем статистику по pollId
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
      
      // Получаем голоса текущего пользователя
      if (session?.user?.id) {
        const userVotes = await prisma.newsPollVote.findMany({
          where: {
            userId: session.user.id,
            pollId: { in: pollIds },
          },
          select: {
            pollId: true,
            optionId: true,
          },
        });
        userPollVotes = userVotes.reduce(
          (acc, vote) => {
            acc[vote.pollId] = vote.optionId;
            return acc;
          },
          {} as Record<string, string>
        );
      }
    }

    return NextResponse.json({
      news: news.map((post) => ({
        ...post,
        isLiked: userLikes.includes(post.id),
        polls: post.polls.map((poll) => {
          const options = poll.options as Array<{ id: string; text: string }>;
          const stats = pollStats[poll.id] || [];
          const totalVotes = stats.reduce((sum, s) => sum + s.count, 0);
          
          return {
            ...poll,
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
            userVote: userPollVotes[poll.id] || null,
          };
        }),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[api/news] Error:", error);
    
    // Более детальная обработка ошибок
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Если ошибка связана с базой данных
    if (errorMessage.includes("Prisma") || errorMessage.includes("database")) {
      console.error("[api/news] Database error:", error);
      return NextResponse.json(
        { error: "Ошибка базы данных. Попробуйте позже." },
        { status: 503 }
      );
    }
    
    // Если ошибка связана с кешем
    if (errorMessage.includes("cache") || errorMessage.includes("Cache")) {
      console.error("[api/news] Cache error:", error);
      // Пробуем вернуть данные без кеша
      try {
        // Здесь можно попробовать загрузить данные напрямую без кеша
        // Но для простоты просто возвращаем ошибку
      } catch (retryError) {
        console.error("[api/news] Retry failed:", retryError);
      }
    }
    
    return NextResponse.json(
      { error: "Не удалось загрузить новости. Попробуйте обновить страницу." },
      { status: 500 }
    );
  }
}

