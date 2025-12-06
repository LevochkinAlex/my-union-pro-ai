import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

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
      coverImage: (post as any).coverImage || null,
      isLiked: post.likes.length > 0,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      viewCount: (post as any).viewCount || 0,
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
    let content = (formData.get("content") as string) || "";
    const postType = (formData.get("postType") as string) || "text";
    const linkMetadata = formData.get("linkMetadata");
    const videoMetadata = formData.get("videoMetadata");
    const coverImageRaw = formData.get("coverImage");
    const files = formData.getAll("attachments") as File[];

    // Если это статья, извлекаем и загружаем изображения из HTML
    if (postType === "article" && content) {
      try {
        // Извлекаем все img теги из HTML
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        const imageUrls: string[] = [];
        let match;
        
        while ((match = imgRegex.exec(content)) !== null) {
          const imageUrl = match[1];
          // Пропускаем уже локальные пути и data: URLs
          if (!imageUrl.startsWith("/") && !imageUrl.startsWith("data:") && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))) {
            imageUrls.push(imageUrl);
          }
        }

        // Загружаем каждое изображение на сервер
        for (const imageUrl of imageUrls) {
          try {
            console.log(`[posts] Downloading image from: ${imageUrl}`);
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
              console.error(`[posts] Failed to download image: ${imageResponse.status}`);
              continue;
            }

            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
            
            // Определяем расширение файла
            let extension = ".jpg";
            if (contentType.includes("png")) extension = ".png";
            else if (contentType.includes("webp")) extension = ".webp";
            else if (contentType.includes("gif")) extension = ".gif";
            
            // Создаем уникальное имя файла
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
            const fileKey = `posts/${fileName}`;
            
            let finalFilePath: string;
            
            if (isVDSStorageConfigured()) {
              try {
                finalFilePath = await uploadFileToVDS(fileKey, imageBuffer, contentType);
                console.log(`[posts] Image uploaded to VDS: ${finalFilePath}`);
              } catch (vdsError) {
                console.error(`[posts] VDS upload error, using local:`, vdsError);
                await mkdir(UPLOAD_DIR, { recursive: true });
                const localFilePath = path.join(UPLOAD_DIR, fileName);
                await writeFile(localFilePath, imageBuffer);
                finalFilePath = `/uploads/posts/${fileName}`;
              }
            } else {
              await mkdir(UPLOAD_DIR, { recursive: true });
              const localFilePath = path.join(UPLOAD_DIR, fileName);
              await writeFile(localFilePath, imageBuffer);
              finalFilePath = `/uploads/posts/${fileName}`;
            }

            // Заменяем URL в HTML на локальный путь через API
            const apiPath = `/api/uploads/posts/${fileName}`;
            content = content.replace(imageUrl, apiPath);
            console.log(`[posts] Replaced image URL: ${imageUrl} -> ${apiPath}`);
          } catch (error) {
            console.error(`[posts] Error processing image ${imageUrl}:`, error);
            // Продолжаем обработку других изображений
          }
        }
      } catch (error) {
        console.error("[posts] Error extracting images from HTML:", error);
        // Продолжаем сохранение поста даже если не удалось обработать изображения
      }
    }

    // Проверяем, что есть либо текст, либо файлы
    const hasContent = content && content.trim().length > 0;
    const hasFiles = files.length > 0 && files.some(f => f && f.size > 0);

    if (!hasContent && !hasFiles) {
      return NextResponse.json(
        { error: "Пост должен содержать текст или вложения" },
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

    // Обрабатываем cover image для статей и обычных постов
    let coverImage: string | null = null;
    if (coverImageRaw) {
      const coverImageValue = coverImageRaw as string;
      if (coverImageValue.trim() === "") {
        coverImage = null;
      } else if (coverImageValue.startsWith("http://") || coverImageValue.startsWith("https://")) {
        // Если это внешний URL, загружаем на сервер
        try {
          console.log(`[posts] Downloading cover image from: ${coverImageValue}`);
          const imageResponse = await fetch(coverImageValue);
          if (imageResponse.ok) {
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
            
            // Конвертируем HEIC если нужно
            let finalBuffer = imageBuffer;
            if (contentType.includes("heic") || contentType.includes("heif") || 
                coverImageValue.toLowerCase().endsWith('.heic') || coverImageValue.toLowerCase().endsWith('.heif')) {
              try {
                const converted = await convertHeicToJpegServer(imageBuffer, coverImageValue, contentType);
                finalBuffer = Buffer.from(converted.buffer);
              } catch (convertError) {
                console.error(`[posts] Error converting cover HEIC:`, convertError);
              }
            }
            
            let extension = ".jpg";
            if (contentType.includes("png")) extension = ".png";
            else if (contentType.includes("webp")) extension = ".webp";
            else if (contentType.includes("gif")) extension = ".gif";
            
            const fileName = `cover-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
            const fileKey = `posts/${fileName}`;
            
            if (isVDSStorageConfigured()) {
              try {
                coverImage = await uploadFileToVDS(fileKey, finalBuffer, contentType);
                console.log(`[posts] Cover image uploaded to VDS: ${coverImage}`);
              } catch (vdsError) {
                console.error(`[posts] VDS upload error for cover, using local:`, vdsError);
                await mkdir(UPLOAD_DIR, { recursive: true });
                const localFilePath = path.join(UPLOAD_DIR, fileName);
                await writeFile(localFilePath, finalBuffer);
                coverImage = `/api/uploads/posts/${fileName}`;
              }
            } else {
              await mkdir(UPLOAD_DIR, { recursive: true });
              const localFilePath = path.join(UPLOAD_DIR, fileName);
              await writeFile(localFilePath, finalBuffer);
              coverImage = `/api/uploads/posts/${fileName}`;
            }
          } else {
            console.error(`[posts] Failed to download cover image: ${imageResponse.status}`);
            coverImage = coverImageValue; // Используем оригинальный URL
          }
        } catch (error) {
          console.error(`[posts] Error processing cover image:`, error);
          coverImage = coverImageValue; // Используем оригинальный URL
        }
      } else {
        // Локальный путь или data URL
        coverImage = coverImageValue;
      }
    }

    // Создаем пост
    const post = await prisma.userPost.create({
      data: {
        authorId: session.user.id,
        content: content.trim() || "", // Разрешаем пустой контент, если есть вложения
        postType,
        linkMetadata: parsedLinkMetadata,
        videoMetadata: parsedVideoMetadata,
        ...(postType === "article" && coverImage !== null ? { coverImage } : {}),
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

    if (files.length > 0) {
      // Создаем директорию для загрузок (для локального fallback)
      await mkdir(UPLOAD_DIR, { recursive: true });

      for (const file of files) {
        if (!file || file.size === 0) continue;

        const bytes = await file.arrayBuffer();
        let buffer: Buffer = Buffer.from(bytes) as Buffer;
        let originalName = file.name;
        let mimeType = file.type || "";

        // Конвертируем HEIC/HEIF в JPEG, если это изображение (но не GIF)
        if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
          try {
            const converted = await convertHeicToJpegServer(buffer, originalName, mimeType);
            buffer = converted.buffer as Buffer;
            originalName = converted.fileName;
            mimeType = converted.mimeType;
          } catch (error) {
            console.error(`[posts] Error converting HEIC for ${originalName}:`, error);
            // Продолжаем с оригинальным файлом при ошибке конвертации
          }
        }

        const fileExtension = path.extname(originalName);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
        const localFilePath = path.join(UPLOAD_DIR, fileName);

        // Определяем тип файла
        let attachmentType = "file";
        if (mimeType.startsWith("image/")) {
          attachmentType = "image";
        } else if (mimeType.startsWith("video/")) {
          attachmentType = "video";
        }

        let finalFilePath = `/uploads/posts/${fileName}`;

        // Пытаемся загрузить на VDS, если он настроен, иначе сохраняем локально
        if (isVDSStorageConfigured()) {
          try {
            const fileKey = `posts/${fileName}`;
            const vdsUrl = await uploadFileToVDS(fileKey, buffer, mimeType);
            if (vdsUrl) {
              finalFilePath = vdsUrl;
              console.log(`[posts] File uploaded to VDS: ${vdsUrl}`);
            } else {
              throw new Error("VDS upload returned no URL");
            }
          } catch (vdsError) {
            console.error(`[posts] VDS upload error:`, vdsError);
            throw new Error(`Не удалось загрузить файл на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
          }
        } else {
          throw new Error("VDS storage не настроен. Настройте переменные окружения VDS_STORAGE_HOST, VDS_STORAGE_PASSWORD или VDS_STORAGE_PRIVATE_KEY_PATH");
        }

        const attachment = await prisma.postAttachment.create({
          data: {
            postId: post.id,
            type: attachmentType,
            fileName: fileName,
            originalName: originalName,
            filePath: finalFilePath,
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
        const { sendUserNotification } = await import("@/lib/notifications");
        const authorName = `${post.author.firstName || ""} ${post.author.middleName || ""} ${post.author.lastName || ""}`.trim() || "Пользователь";

        for (const subscription of subscribers) {
          const messageText = content.trim() || (attachments.length > 0 ? "Новое изображение" : "Новый пост");
          await sendUserNotification({
            userId: subscription.subscriberId,
            type: "user_post",
            title: `📝 Новый пост от ${authorName}`,
            body: messageText.substring(0, 100),
            url: `/dashboard/profile/${session.user.id}`,
            senderName: authorName,
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
    console.error("[posts] POST Error:", {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      name: error?.name,
    });
    return NextResponse.json(
      { 
        error: "Внутренняя ошибка сервера",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

