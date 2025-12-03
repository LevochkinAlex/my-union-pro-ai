import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST - лайк/анлайк поста
export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } | Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const postId = resolvedParams.postId;

    // Проверяем существование поста
    const post = await prisma.userPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
    }

    // Проверяем, есть ли уже лайк
    const existingLike = await prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: session.user.id,
        },
      },
    });

    if (existingLike) {
      // Удаляем лайк
      await prisma.postLike.delete({
        where: { id: existingLike.id },
      });

      // Обновляем счетчик
      await prisma.userPost.update({
        where: { id: postId },
        data: {
          likesCount: {
            decrement: 1,
          },
        },
      });

      return NextResponse.json({ liked: false });
    } else {
      // Создаем лайк
      await prisma.postLike.create({
        data: {
          postId,
          userId: session.user.id,
        },
      });

      // Обновляем счетчик
      await prisma.userPost.update({
        where: { id: postId },
        data: {
          likesCount: {
            increment: 1,
          },
        },
      });

      return NextResponse.json({ liked: true });
    }
  } catch (error: any) {
    console.error("[posts/like] Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

