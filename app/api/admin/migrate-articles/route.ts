import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/migrate-articles - Миграция статей в новый формат
 * Доступ только для администраторов
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права администратора
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "admin" && user?.role !== "superadmin") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { action } = await request.json();

    if (action === "convert-to-article") {
      // Конвертируем посты с длинным контентом (>500 символов) или с HTML тегами в статьи
      const posts = await prisma.userPost.findMany({
        where: {
          OR: [
            { postType: "text" },
            { postType: null },
          ],
        },
      });

      let convertedCount = 0;
      for (const post of posts) {
        const content = post.content || "";
        const hasHtmlTags = /<[^>]+>/g.test(content);
        const isLongContent = content.length > 500;

        if (hasHtmlTags || isLongContent) {
          await prisma.userPost.update({
            where: { id: post.id },
            data: { postType: "article" },
          });
          convertedCount++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Конвертировано ${convertedCount} постов в статьи`,
        convertedCount,
      });
    }

    if (action === "list-articles") {
      // Список всех статей с информацией об обложках
      const articles = await prisma.userPost.findMany({
        where: { postType: "article" },
        select: {
          id: true,
          content: true,
          postType: true,
          coverImage: true,
          videoMetadata: true,
          createdAt: true,
          author: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      return NextResponse.json({
        success: true,
        articles: articles.map((a) => ({
          id: a.id,
          contentLength: a.content?.length || 0,
          hasCoverImage: !!a.coverImage,
          hasVideoMetadata: !!a.videoMetadata,
          author: `${a.author.firstName || ""} ${a.author.lastName || ""}`.trim(),
          createdAt: a.createdAt,
        })),
        total: articles.length,
      });
    }

    if (action === "stats") {
      // Статистика по постам
      const stats = await prisma.userPost.groupBy({
        by: ["postType"],
        _count: true,
      });

      const articlesWithCover = await prisma.userPost.count({
        where: {
          postType: "article",
          coverImage: { not: null },
        },
      });

      const articlesWithVideo = await prisma.userPost.count({
        where: {
          postType: "article",
          videoMetadata: { not: null },
        },
      });

      return NextResponse.json({
        success: true,
        stats: {
          byType: stats,
          articlesWithCover,
          articlesWithVideo,
        },
      });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error: any) {
    console.error("[admin/migrate-articles] Error:", error);
    return NextResponse.json(
      { error: error.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

