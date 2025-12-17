import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCache, getCacheKey } from "@/lib/cache";

// GET /api/news - получить список опубликованных новостей
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Кешируем новости на 2 минуты
    const cacheKey = getCacheKey("news:list", { page, limit });
    
    const cachedData = await withCache(
      cacheKey,
      async () => {
        // Получаем только опубликованные новости
        const [newsRaw, total] = await Promise.all([
          prisma.newsPost.findMany({
            where: {
              isPublished: true,
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
              _count: {
                select: {
                  likes: true,
                  comments: true,
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
            orderBy: {
              publishedAt: "desc",
            },
            skip,
            take: limit,
          }),
          prisma.newsPost.count({
            where: {
              isPublished: true,
            },
          }),
        ]);
        
        // Обрезаем content для списка (первые 500 символов для превью)
        const news = newsRaw.map(n => ({
          ...n,
          content: n.content ? n.content.substring(0, 500) + (n.content.length > 500 ? '...' : '') : '',
        }));
        return { news, total };
      },
      120 // 2 минуты
    );
    
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

    // Если пользователь авторизован, получаем его голоса в опросах
    let userPollVotes: Record<string, string> = {};
    if (session?.user?.id) {
      const pollIds = news.flatMap((n) => n.polls.map((p) => p.id));
      if (pollIds.length > 0) {
        const votes = await prisma.newsPollVote.findMany({
          where: {
            userId: session.user.id,
            pollId: {
              in: pollIds,
            },
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
    }

    return NextResponse.json({
      news: news.map((post) => ({
        ...post,
        isLiked: userLikes.includes(post.id),
        polls: post.polls.map((poll) => ({
          ...poll,
          userVote: userPollVotes[poll.id] || null,
        })),
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
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}

