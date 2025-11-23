import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/news/polls/[pollId]/vote - проголосовать в опросе
export async function POST(
  request: NextRequest,
  { params }: { params: { pollId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pollId } = params;
    const { optionId } = await request.json();

    if (!optionId) {
      return NextResponse.json(
        { error: "Option ID is required" },
        { status: 400 }
      );
    }

    // Получаем опрос
    const poll = await prisma.newsPoll.findUnique({
      where: { id: pollId },
      include: {
        newsPost: {
          select: {
            id: true,
            isPublished: true,
          },
        },
      },
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    // Проверяем, опубликована ли новость
    if (!poll.newsPost.isPublished && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    // Проверяем, закрыт ли опрос
    if (poll.isClosed || (poll.closesAt && new Date(poll.closesAt) < new Date())) {
      return NextResponse.json(
        { error: "Poll is closed" },
        { status: 400 }
      );
    }

    // Проверяем, существует ли вариант ответа
    const options = poll.options as any[];
    const optionExists = options.some((opt: any) => opt.id === optionId);
    if (!optionExists) {
      return NextResponse.json(
        { error: "Invalid option ID" },
        { status: 400 }
      );
    }

    // Проверяем, голосовал ли уже пользователь
    const existingVote = await prisma.newsPollVote.findUnique({
      where: {
        pollId_userId: {
          pollId,
          userId: session.user.id,
        },
      },
    });

    if (existingVote) {
      // Обновляем голос
      await prisma.newsPollVote.update({
        where: {
          id: existingVote.id,
        },
        data: {
          optionId,
        },
      });
    } else {
      // Создаем новый голос
      await prisma.newsPollVote.create({
        data: {
          pollId,
          userId: session.user.id,
          optionId,
        },
      });
    }

    // Получаем обновленную статистику
    const votes = await prisma.newsPollVote.groupBy({
      by: ["optionId"],
      where: {
        pollId,
      },
      _count: {
        optionId: true,
      },
    });

    const totalVotes = votes.reduce((sum, v) => sum + v._count.optionId, 0);
    const optionsWithStats = options.map((option: any) => {
      const voteCount = votes.find((v) => v.optionId === option.id)?._count.optionId || 0;
      const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;

      return {
        ...option,
        voteCount,
        percentage: Math.round(percentage * 10) / 10,
      };
    });

    return NextResponse.json({
      success: true,
      poll: {
        ...poll,
        options: optionsWithStats,
        totalVotes,
        userVote: optionId,
      },
    });
  } catch (error) {
    console.error("[api/news/polls/[pollId]/vote] Error:", error);
    return NextResponse.json(
      { error: "Failed to vote" },
      { status: 500 }
    );
  }
}

