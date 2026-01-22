import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeUserAvatar } from "@/lib/api-helpers";

// GET /api/news/[id]/likes - получить список пользователей, которые поставили лайк
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id } = resolvedParams;

    // Проверяем существование новости
    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
      select: { id: true, isPublished: true },
    });

    if (!newsPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    // Получаем список лайков с информацией о пользователях
    const likes = await prisma.newsLike.findMany({
      where: { newsPostId: id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10, // Ограничиваем до 10 для preview
    });

    // Нормализуем аватары
    const normalizedLikes = likes.map(like => ({
      id: like.id,
      userId: like.userId,
      createdAt: like.createdAt,
      user: normalizeUserAvatar(like.user),
    }));

    // Получаем общее количество лайков
    const totalCount = await prisma.newsLike.count({
      where: { newsPostId: id },
    });

    return NextResponse.json({
      likes: normalizedLikes,
      totalCount,
    });
  } catch (error) {
    console.error("[api/news/[id]/likes] Error:", error);
    return NextResponse.json(
      { error: "Failed to get likes" },
      { status: 500 }
    );
  }
}
