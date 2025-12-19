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
    const cacheKey = getCacheKey("news:list", { page, limit, orgId: userOrganizationId });
    
    const cachedData = await withCache(
      cacheKey,
      async () => {
        // Фильтруем новости по организации пользователя
        // Показываем новости из каналов организации пользователя + общие новости
        const whereClause: any = {
          isPublished: true,
        };

        // Если пользователь авторизован и у него есть организация
        // показываем новости из каналов его организации + общие новости (без организации)
        if (userOrganizationId) {
          whereClause.OR = [
            // Новости из каналов организации пользователя
            { channel: { organizationId: userOrganizationId } },
            // Общие новости (без канала или канал без организации)
            { channelId: null },
            { channel: { organizationId: null } },
          ];
        } else {
          // Для неавторизованных или пользователей без организации
          // показываем только общие новости без привязки к организации
          whereClause.OR = [
            { channelId: null },
            { channel: { organizationId: null } },
          ];
        }

        // Получаем только опубликованные новости
        const [newsRaw, total] = await Promise.all([
          prisma.newsPost.findMany({
            where: whereClause,
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
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}

