import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "posts");

// GET - получение поста
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { postId } = await params;

    const post = await prisma.userPost.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            jobTitle: true,
            profession: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        attachments: {
          orderBy: {
            createdAt: "asc",
          },
        },
        likes: {
          where: {
            userId: session.user.id,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
    }

    return NextResponse.json({
      post: {
        id: post.id,
        content: post.content,
        postType: post.postType,
        author: post.author,
        attachments: post.attachments,
        linkMetadata: post.linkMetadata,
        videoMetadata: post.videoMetadata,
        isLiked: post.likes.length > 0,
        likesCount: post._count.likes,
        commentsCount: post._count.comments,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[posts] GET Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// PATCH - обновление поста
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { postId } = await params;

    // Проверяем, что пост существует и принадлежит пользователю
    const existingPost = await prisma.userPost.findUnique({
      where: { id: postId },
    });

    if (!existingPost) {
      return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
    }

    if (existingPost.authorId !== session.user.id) {
      return NextResponse.json(
        { error: "Нет доступа к редактированию этого поста" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const content = formData.get("content") as string;
    const postType = (formData.get("postType") as string) || existingPost.postType;
    const linkMetadata = formData.get("linkMetadata");
    const videoMetadata = formData.get("videoMetadata");

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Содержимое поста не может быть пустым" },
        { status: 400 }
      );
    }

    // Парсим метаданные
    let parsedLinkMetadata = existingPost.linkMetadata;
    let parsedVideoMetadata = existingPost.videoMetadata;

    if (linkMetadata) {
      try {
        parsedLinkMetadata = JSON.parse(linkMetadata as string);
      } catch (e) {
        console.error("[posts] Error parsing linkMetadata:", e);
      }
    }

    if (videoMetadata) {
      try {
        parsedVideoMetadata = JSON.parse(videoMetadata as string);
      } catch (e) {
        console.error("[posts] Error parsing videoMetadata:", e);
      }
    }

    // Обновляем пост
    const post = await prisma.userPost.update({
      where: { id: postId },
      data: {
        content: content.trim(),
        postType,
        linkMetadata: parsedLinkMetadata,
        videoMetadata: parsedVideoMetadata,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            jobTitle: true,
            profession: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        attachments: {
          orderBy: {
            createdAt: "asc",
          },
        },
        likes: {
          where: {
            userId: session.user.id,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    // Обрабатываем новые вложения
    const files = formData.getAll("attachments") as File[];

    if (files.length > 0) {
      await mkdir(UPLOAD_DIR, { recursive: true });

      for (const file of files) {
        if (!file || file.size === 0) continue;

        const fileExtension = path.extname(file.name);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filePath, buffer);

        const mimeType = file.type || "";
        let attachmentType = "file";
        if (mimeType.startsWith("image/")) {
          attachmentType = "image";
        } else if (mimeType.startsWith("video/")) {
          attachmentType = "video";
        }

        await prisma.postAttachment.create({
          data: {
            postId: post.id,
            type: attachmentType,
            fileName: fileName,
            originalName: file.name,
            filePath: `/uploads/posts/${fileName}`,
            fileSize: file.size,
            mimeType: mimeType || null,
          },
        });
      }
    }

    return NextResponse.json({
      post: {
        id: post.id,
        content: post.content,
        postType: post.postType,
        author: post.author,
        attachments: post.attachments,
        linkMetadata: post.linkMetadata,
        videoMetadata: post.videoMetadata,
        isLiked: post.likes.length > 0,
        likesCount: post._count.likes,
        commentsCount: post._count.comments,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[posts] PATCH Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// DELETE - удаление поста
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { postId } = await params;

    // Проверяем, что пост существует и принадлежит пользователю
    const post = await prisma.userPost.findUnique({
      where: { id: postId },
      include: {
        attachments: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
    }

    if (post.authorId !== session.user.id) {
      return NextResponse.json(
        { error: "Нет доступа к удалению этого поста" },
        { status: 403 }
      );
    }

    // Удаляем файлы вложений
    for (const attachment of post.attachments) {
      try {
        const filePath = path.join(process.cwd(), "public", attachment.filePath);
        await unlink(filePath);
      } catch (error) {
        console.error(`[posts] Error deleting file ${attachment.filePath}:`, error);
        // Продолжаем удаление даже если файл не найден
      }
    }

    // Удаляем пост (вложения удалятся каскадно)
    await prisma.userPost.delete({
      where: { id: postId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[posts] DELETE Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

