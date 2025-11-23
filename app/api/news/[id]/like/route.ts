import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/news/[id]/like - поставить/убрать лайк
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Проверяем существование новости
    const newsPost = await prisma.newsPost.findUnique({
      where: { id },
      select: { id: true, isPublished: true },
    });

    if (!newsPost) {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
    }

    const sessionUser = await getServerSession(authOptions);
    if (!newsPost.isPublished && sessionUser?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "News not found" }, { status: 404 });
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
      // Ставим лайк
      await prisma.newsLike.create({
        data: {
          newsPostId: id,
          userId: session.user.id,
        },
      });

      const count = await prisma.newsLike.count({
        where: { newsPostId: id },
      });

      return NextResponse.json({ liked: true, count });
    }
  } catch (error) {
    console.error("[api/news/[id]/like] Error:", error);
    return NextResponse.json(
      { error: "Failed to toggle like" },
      { status: 500 }
    );
  }
}

