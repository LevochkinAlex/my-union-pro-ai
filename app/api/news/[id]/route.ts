import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/news/[id] - получить одну новость
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = params;

    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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
    });

    if (!newsPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    // Проверяем, опубликована ли новость (или пользователь - супер-админ)
    if (!newsPost.isPublished && session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    // Получаем лайк пользователя
    let isLiked = false;
    if (session?.user?.id) {
      const like = await prisma.newsLike.findUnique({
        where: {
          newsPostId_userId: {
            newsPostId: id,
            userId: session.user.id,
          },
        },
      });
      isLiked = !!like;
    }

    // Получаем голоса пользователя в опросах
    let userPollVotes: Record<string, string> = {};
    if (session?.user?.id && newsPost.polls.length > 0) {
      const pollIds = newsPost.polls.map((p) => p.id);
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

    // Получаем статистику голосов для каждого опроса
    const pollsWithStats = await Promise.all(
      newsPost.polls.map(async (poll) => {
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
        const options = (poll.options as any[]).map((option: any) => {
          const voteCount = votes.find((v) => v.optionId === option.id)?._count.optionId || 0;
          const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;

          return {
            ...option,
            voteCount,
            percentage: Math.round(percentage * 10) / 10,
          };
        });

        return {
          ...poll,
          options,
          totalVotes,
          userVote: userPollVotes[poll.id] || null,
        };
      })
    );

    return NextResponse.json({
      ...newsPost,
      isLiked,
      polls: pollsWithStats,
    });
  } catch (error) {
    console.error("[api/news/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}

