import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCache, getCacheKey } from "@/lib/cache";
import { isDemoUserId } from "@/lib/demo";
import { getDemoNews } from "@/lib/demo";

// GET /api/news - получить список опубликованных новостей
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Демо-режим: мок-новости без БД
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

    // Получаем организацию пользователя для фильтрации
    let userOrganizationId: string | null = null;
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true },
      });
      userOrganizationId = user?.organizationId || null;
    }

    // Кешируем новости на 2 минуты (с учётом организации)
    // withCache всегда выполняет функцию, даже если Redis недоступен
    const cacheKey = getCacheKey("news:list", { page, limit, orgId: userOrganizationId });
    
    let cachedData;
    try {
      cachedData = await withCache(
      cacheKey,
      async () => {
        // Фильтруем новости ТОЛЬКО по организации пользователя
        // Каждая организация создает свой ареал - пользователи видят только новости своей организации
        const whereClause: any = {
          isPublished: true,
        };

        // Если пользователь авторизован и у него есть организация
        // показываем ТОЛЬКО новости из каналов его организации
        if (userOrganizationId) {
          whereClause.channel = {
            organizationId: userOrganizationId,
          };
        } else {
          // Для неавторизованных или пользователей без организации
          // показываем только общие новости без привязки к организации
          whereClause.OR = [
            { channelId: null },
            { channel: { organizationId: null } },
          ];
        }

        // Получаем только опубликованные новости с оптимизированным select
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
            orderBy: {
              publishedAt: "desc",
            },
            skip,
            take: limit,
          }),
          prisma.newsPost.count({
            where: whereClause,
          }),
        ]);
        
        // Возвращаем полный контент - клиент сам обрежет для превью
        // Это позволяет показывать полный текст при нажатии "Показать полностью"
        const news = newsRaw.map(n => {
          return {
            ...n,
            content: n.content || '', // Возвращаем полный контент
            coverImage: n.coverImage, // Возвращаем coverImage как есть
          };
        });
        return { news, total };
      },
      120 // 2 минуты
    );
    } catch (cacheError) {
      // Если ошибка кеша, пробуем загрузить данные напрямую
      console.error("[api/news] Cache error, loading directly:", cacheError);
      const whereClause: any = {
        isPublished: true,
      };

      if (userOrganizationId) {
        whereClause.channel = {
          organizationId: userOrganizationId,
        };
      } else {
        whereClause.OR = [
          { channelId: null },
          { channel: { organizationId: null } },
        ];
      }

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
          orderBy: {
            publishedAt: "desc",
          },
          skip,
          take: limit,
        }),
        prisma.newsPost.count({
          where: whereClause,
        }),
      ]);

      cachedData = {
        news: newsRaw.map(n => ({
          ...n,
          content: n.content || '',
          coverImage: n.coverImage,
        })),
        total,
      };
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

