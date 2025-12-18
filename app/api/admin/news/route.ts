import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { invalidateNewsCache } from "@/lib/cache-invalidation";
import { extractFilePathFromUrl } from "@/lib/cdn";
// import { sendNotification } from "@/lib/notifications"; // TODO: Implement mass notification system

// GET /api/admin/news - получить все новости (включая неопубликованные)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const [news, total] = await Promise.all([
      prisma.newsPost.findMany({
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
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.newsPost.count(),
    ]);

    return NextResponse.json({
      news,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[api/admin/news] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}

// POST /api/admin/news - создать новость
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, coverImage, isPublished, polls } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    // Нормализуем coverImage - сохраняем только относительный путь или data URL
    let normalizedCoverImage: string | null = null;
    if (coverImage) {
      // Если это data URL - сохраняем как есть (для совместимости со старыми данными)
      if (coverImage.startsWith("data:")) {
        normalizedCoverImage = coverImage;
      } else {
        // Используем готовую функцию для извлечения пути
        normalizedCoverImage = extractFilePathFromUrl(coverImage);
      }
    }

    console.log("[admin/news POST] Creating news with coverImage:", normalizedCoverImage?.substring(0, 100) || "null");

    // Создаем новость
    const newsPost = await prisma.newsPost.create({
      data: {
        title,
        content,
        coverImage: normalizedCoverImage,
        authorId: session.user.id!,
        isPublished: isPublished || false,
        publishedAt: isPublished ? new Date() : null,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Создаем опросы, если они есть
    if (polls && Array.isArray(polls) && polls.length > 0) {
      await Promise.all(
        polls.map((poll: any) =>
          prisma.newsPoll.create({
            data: {
              newsPostId: newsPost.id,
              question: poll.question,
              options: poll.options,
              isClosed: poll.isClosed || false,
              closesAt: poll.closesAt ? new Date(poll.closesAt) : null,
            },
          })
        )
      );
    }

    // TODO: Если новость опубликована, отправляем уведомления всем пользователям
    // Требуется реализация функции массовых уведомлений
    if (isPublished) {
      console.log("[api/admin/news] Новость опубликована, массовые уведомления пока отключены");
    }

    // Инвалидируем кеш новостей
    await invalidateNewsCache();

    // Получаем полную новость с опросами
    const fullNewsPost = await prisma.newsPost.findUnique({
      where: { id: newsPost.id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        polls: true,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    return NextResponse.json(fullNewsPost, { status: 201 });
  } catch (error) {
    console.error("[api/admin/news] Error:", error);
    return NextResponse.json(
      { error: "Failed to create news" },
      { status: 500 }
    );
  }
}

