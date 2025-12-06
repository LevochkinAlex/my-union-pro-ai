import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH - редактировать комментарий
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { postId, commentId } = await params;
    const { content } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json(
        { error: "Комментарий не может быть пустым" },
        { status: 400 }
      );
    }

    // Проверяем, что комментарий принадлежит пользователю
    const existingComment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: { userId: true, postId: true },
    });

    if (!existingComment) {
      return NextResponse.json(
        { error: "Комментарий не найден" },
        { status: 404 }
      );
    }

    if (existingComment.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Нет прав для редактирования этого комментария" },
        { status: 403 }
      );
    }

    if (existingComment.postId !== postId) {
      return NextResponse.json(
        { error: "Комментарий не принадлежит этому посту" },
        { status: 400 }
      );
    }

    // Обновляем комментарий
    const updatedComment = await prisma.postComment.update({
      where: { id: commentId },
      data: {
        content: content.trim(),
        updatedAt: new Date(),
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

    return NextResponse.json({ comment: updatedComment });
  } catch (error) {
    console.error("Error updating comment:", error);
    return NextResponse.json(
      { error: "Ошибка при обновлении комментария" },
      { status: 500 }
    );
  }
}

// DELETE - удалить комментарий
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { postId, commentId } = await params;

    // Проверяем, что комментарий принадлежит пользователю
    const existingComment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: { userId: true, postId: true },
    });

    if (!existingComment) {
      return NextResponse.json(
        { error: "Комментарий не найден" },
        { status: 404 }
      );
    }

    if (existingComment.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Нет прав для удаления этого комментария" },
        { status: 403 }
      );
    }

    if (existingComment.postId !== postId) {
      return NextResponse.json(
        { error: "Комментарий не принадлежит этому посту" },
        { status: 400 }
      );
    }

    // Удаляем комментарий (каскадное удаление ответов настроено в схеме)
    await prisma.postComment.delete({
      where: { id: commentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении комментария" },
      { status: 500 }
    );
  }
}

