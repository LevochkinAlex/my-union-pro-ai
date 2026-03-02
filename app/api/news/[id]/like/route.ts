import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/news/[id]/like - поставить/убрать лайк
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Войдите в аккаунт, чтобы ставить лайки" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams?.id;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Не указан id новости" }, { status: 400 });
    }

    // Проверяем существование новости (любая опубликованная, в т.ч. из регионального канала РПО)
    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
      select: { id: true, isPublished: true },
    });

    if (!newsPost) {
      return NextResponse.json({ error: "Новость не найдена" }, { status: 404 });
    }

    if (!newsPost.isPublished && (session.user as any)?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Новость не найдена" }, { status: 404 });
    }

    // Проверяем, есть ли уже лайк
    const existingLike = await prisma.newsLike.findUnique({
      where: {
        newsPostId_userId: {
          newsPostId: id,
          userId: session.user.id,
        },
      },
    });

    if (existingLike) {
      // Убираем лайк
      await prisma.newsLike.delete({
        where: {
          id: existingLike.id,
        },
      });

      const count = await prisma.newsLike.count({
        where: { newsPostId: id },
      });

      return NextResponse.json({ liked: false, count });
    } else {
      // Ставим лайк (любая опубликованная новость, в т.ч. региональная РПО)
      try {
        await prisma.newsLike.create({
          data: {
            newsPostId: id,
            userId: session.user.id,
          },
        });
      } catch (createError: any) {
        // Уже стоит лайк (race или рассинхрон UI) — считаем успехом
        if (createError?.code === "P2002") {
          const count = await prisma.newsLike.count({
            where: { newsPostId: id },
          });
          return NextResponse.json({ liked: true, count });
        }
        throw createError;
      }

      const count = await prisma.newsLike.count({
        where: { newsPostId: id },
      });

      return NextResponse.json({ liked: true, count });
    }
  } catch (error: any) {
    console.error("[api/news/[id]/like] Error:", error);
    const message = error?.code === "P2003" ? "Новость не найдена" : "Не удалось поставить лайк";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

