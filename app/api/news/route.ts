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
        select: { 
          organizationId: true,
          email: true,
          organization: {
            select: { name: true },
          },
        },
      });
      userOrganizationId = user?.organizationId || null;
      console.log("[api/news] User organization:", {
        userId: session.user.id,
        email: user?.email,
        organizationId: userOrganizationId,
        organizationName: user?.organization?.name,
      });
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

        // Логируем условие фильтрации
        console.log("[api/news] Where clause:", JSON.stringify(whereClause, null, 2));
        
        // Логируем каналы организации для отладки
        if (userOrganizationId) {
          const orgChannels = await prisma.newsChannel.findMany({
            where: { organizationId: userOrganizationId },
            select: { id: true, name: true, organizationId: true },
          });
          console.log("[api/news] Organization channels:", orgChannels);
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
        
        console.log("[api/news] Found news:", {
          count: newsRaw.length,
          total,
          newsIds: newsRaw.map(n => n.id),
        });
        
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

