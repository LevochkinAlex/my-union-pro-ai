import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/news/[id]/view - увеличить счётчик просмотров (только один раз на пользователя)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(params);
    const { id: newsPostId } = resolvedParams;
    const userId = session.user.id;

    // Используем транзакцию для атомарности операции
    const result = await prisma.$transaction(async (tx) => {
      // Проверяем, не просматривал ли уже пользователь эту новость
      const existingView = await tx.newsView.findUnique({
        where: {
          newsPostId_userId: {
            newsPostId,
            userId,
          },
        },
      });

      // Если уже просматривал, возвращаем текущий счетчик без изменения
      if (existingView) {
        const newsPost = await tx.newsPost.findUnique({
          where: { id: newsPostId },
          select: { viewCount: true },
        });
        return { viewCount: newsPost?.viewCount || 0, wasNew: false };
      }

      // Создаем запись о просмотре и увеличиваем счетчик
      await Promise.all([
        tx.newsView.create({
          data: {
            newsPostId,
            userId,
          },
        }),
        tx.newsPost.update({
          where: { id: newsPostId },
          data: {
            viewCount: {
              increment: 1,
            },
          },
        }),
      ]);

      // Получаем обновленный счетчик
      const updatedPost = await tx.newsPost.findUnique({
        where: { id: newsPostId },
        select: { viewCount: true },
      });

      return { viewCount: updatedPost?.viewCount || 0, wasNew: true };
    });

    return NextResponse.json({ viewCount: result.viewCount });
  } catch (error) {
    console.error("[api/news/[id]/view] Error:", error);
    return NextResponse.json(
      { error: "Failed to increment view count" },
      { status: 500 }
    );
  }
}

