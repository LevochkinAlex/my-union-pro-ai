import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPPOHead } from "@/lib/ppo-head-utils";

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

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    // Получаем каналы организации
    const channels = await prisma.newsChannel.findMany({
      where: {
        organizationId: chairman.organizationId,
      },
      select: {
        id: true,
      },
    });

    const channelIds = channels.map((ch) => ch.id);

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
        polls: post.polls.map((poll) => ({
          id: poll.id,
          question: poll.question,
          options: poll.options as any[],
          totalVotes: poll._count.votes,
          userVote: poll.votes[0]?.optionId || null,
          isClosed: poll.isClosed,
        })),
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
      select: { organizationId: true },
    });

    if (!channel || channel.organizationId !== chairman.organizationId) {
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
      },
    });

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

