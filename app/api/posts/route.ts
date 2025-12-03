import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "posts");

// GET - получение постов пользователя
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: any = {};
    if (userId) {
      where.authorId = userId;
    }

    const posts = await prisma.userPost.findMany({
      where,
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
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Форматируем ответ
    const formattedPosts = posts.map((post) => ({
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
    }));

    return NextResponse.json({ posts: formattedPosts });
  } catch (error: any) {
    console.error("[posts] GET Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// POST - создание поста
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const content = formData.get("content") as string;
    const postType = (formData.get("postType") as string) || "text";
    const linkMetadata = formData.get("linkMetadata");
    const videoMetadata = formData.get("videoMetadata");

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Содержимое поста не может быть пустым" },
        { status: 400 }
      );
    }

    // Парсим метаданные
    let parsedLinkMetadata = null;
    let parsedVideoMetadata = null;

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

    // Создаем пост
    const post = await prisma.userPost.create({
      data: {
        authorId: session.user.id,
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
        attachments: true,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    // Обрабатываем вложения
    const attachments: any[] = [];
    const files = formData.getAll("attachments") as File[];

    if (files.length > 0) {
      // Создаем директорию для загрузок
      await mkdir(UPLOAD_DIR, { recursive: true });

      for (const file of files) {
        if (!file || file.size === 0) continue;

        const fileExtension = path.extname(file.name);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filePath, buffer);

        // Определяем тип файла
        const mimeType = file.type || "";
        let attachmentType = "file";
        if (mimeType.startsWith("image/")) {
          attachmentType = "image";
        } else if (mimeType.startsWith("video/")) {
          attachmentType = "video";
        }

        const attachment = await prisma.postAttachment.create({
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

        attachments.push(attachment);
      }
    }

    // Отправляем уведомления подписчикам
    try {
      const subscribers = await prisma.userSubscription.findMany({
        where: {
          targetUserId: session.user.id,
          pushNotifications: true,
        },
        include: {
          subscriber: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (subscribers.length > 0) {
        const { sendNotification } = await import("@/lib/notifications");
        const authorName = `${post.author.firstName || ""} ${post.author.middleName || ""} ${post.author.lastName || ""}`.trim() || "Пользователь";

        for (const subscription of subscribers) {
          await sendNotification({
            userId: subscription.subscriberId,
            title: `📝 Новый пост от ${authorName}`,
            message: content.trim().substring(0, 100),
            link: `/dashboard/profile/${session.user.id}`,
            data: {
              type: "user_post",
              postId: post.id,
              authorId: session.user.id,
            },
          });
        }
      }
    } catch (notificationError) {
      console.error("[posts] Error sending notifications:", notificationError);
      // Не прерываем создание поста из-за ошибки уведомлений
    }

    return NextResponse.json({
      post: {
        ...post,
        attachments,
        isLiked: false,
        likesCount: 0,
        commentsCount: 0,
      },
    });
  } catch (error: any) {
    console.error("[posts] POST Error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

