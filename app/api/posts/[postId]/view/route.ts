import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isDemoUserId } from "@/lib/demo";

// POST /api/posts/[postId]/view - увеличить счётчик просмотров (только один раз на пользователя)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { postId } = await params;
    const userId = session.user.id;

    if (!postId) {
      return NextResponse.json({ error: "ID поста не указан" }, { status: 400 });
    }

    // Демо: не обращаемся к БД для демо-постов или демо-пользователей
    if (postId.startsWith("demo-post-") || isDemoUserId(userId)) {
      return NextResponse.json({ viewCount: 0 });
    }

    // Используем транзакцию для атомарности операции
    const result = await prisma.$transaction(async (tx) => {
      // Проверяем, не просматривал ли уже пользователь этот пост
      const existingView = await tx.postView.findUnique({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });

      // Если уже просматривал, возвращаем текущий счетчик без изменения
      if (existingView) {
        const post = await tx.userPost.findUnique({
          where: { id: postId },
          select: { viewCount: true },
        });
        return { viewCount: post?.viewCount || 0, wasNew: false };
      }

      // Создаем запись о просмотре и увеличиваем счетчик
      await Promise.all([
        tx.postView.create({
          data: {
            postId,
            userId,
          },
        }),
        tx.userPost.update({
          where: { id: postId },
          data: {
            viewCount: {
              increment: 1,
            },
          },
        }),
      ]);

      // Получаем обновленный счетчик
      const updatedPost = await tx.userPost.findUnique({
        where: { id: postId },
        select: { viewCount: true },
      });

      return { viewCount: updatedPost?.viewCount || 0, wasNew: true };
    });

    return NextResponse.json({ viewCount: result.viewCount });
  } catch (error: any) {
    console.error("[posts/[postId]/view] Error:", error);
    return NextResponse.json(
      { error: "Failed to increment view count" },
      { status: 500 }
    );
  }
}

