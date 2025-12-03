import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - получение комментариев к посту
export async function GET(
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

    const comments = await prisma.postComment.findMany({
      where: {
        postId,
        parentId: null, // Только корневые комментарии
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json({ comments });
  } catch (error: any) {
    console.error("[posts/comments] GET Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// POST - создание комментария
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
    const { content, parentId } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Комментарий не может быть пустым" },
        { status: 400 }
      );
    }

    // Проверяем существование поста
    const post = await prisma.userPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
    }

    // Создаем комментарий
    const comment = await prisma.postComment.create({
      data: {
        postId,
        userId: session.user.id,
        content: content.trim(),
        parentId: parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Обновляем счетчик комментариев
    await prisma.userPost.update({
      where: { id: postId },
      data: {
        commentsCount: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({ comment });
  } catch (error: any) {
    console.error("[posts/comments] POST Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

