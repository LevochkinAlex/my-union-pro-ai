import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import path from "path";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

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
        coverImage: (post as any).coverImage || null,
        isLiked: post.likes.length > 0,
        likesCount: post._count.likes,
        commentsCount: post._count.comments,
        viewCount: (post as any).viewCount || 0,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("[posts] GET Error:", error);
    console.error("[posts] GET Error details:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера", details: process.env.NODE_ENV === "development" ? error?.message : undefined },
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
    let content = formData.get("content") as string;
    const postType = (formData.get("postType") as string) || existingPost.postType;
    const linkMetadata = formData.get("linkMetadata");
    const videoMetadata = formData.get("videoMetadata");
    const coverImageRaw = formData.get("coverImage");
    const deletedAttachmentIdsRaw = formData.get("deletedAttachmentIds");
    
    // Обрабатываем cover image для всех типов постов
    let coverImage: string | null = null;
    if (coverImageRaw !== null && coverImageRaw !== undefined) {
      // Если это строка
      if (typeof coverImageRaw === "string") {
        const coverImageStr = coverImageRaw.trim();
        
        // Пустая строка = удалить обложку
        if (coverImageStr === "") {
          coverImage = null;
        }
        // Если это уже загруженный файл (URL или API путь), используем как есть
        else if (coverImageStr.startsWith("http://") || 
                 coverImageStr.startsWith("https://") || 
                 coverImageStr.startsWith("/api/uploads/")) {
          coverImage = coverImageStr;
          console.log(`[posts] Using existing cover image URL: ${coverImage}`);
        }
        // Если это путь /uploads/, конвертируем в /api/uploads/
        else if (coverImageStr.startsWith("/uploads/")) {
          coverImage = coverImageStr.replace("/uploads/", "/api/uploads/");
          console.log(`[posts] Normalized cover image path: ${coverImage}`);
        }
        // Если это data URL, загружаем на сервер
        else if (coverImageStr.startsWith("data:")) {
          try {
            const matches = coverImageStr.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const mimeType = matches[1];
              const base64Data = matches[2];
              const buffer = Buffer.from(base64Data, "base64");
              
              let extension = ".jpg";
              if (mimeType.includes("png")) extension = ".png";
              else if (mimeType.includes("webp")) extension = ".webp";
              else if (mimeType.includes("gif")) extension = ".gif";
              
              const fileName = `cover-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
              const fileKey = `posts/${fileName}`;
              
              if (isVDSStorageConfigured()) {
                try {
                  coverImage = await uploadFileToVDS(fileKey, buffer, mimeType);
                  console.log(`[posts] Cover image (data URL) uploaded to VDS: ${coverImage}`);
                } catch (vdsError) {
                  console.error(`[posts] VDS upload error for cover (data URL):`, vdsError);
                  throw new Error(`Не удалось загрузить обложку на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
                }
              } else {
                throw new Error("VDS storage не настроен");
              }
            } else {
              console.error(`[posts] Invalid data URL format for cover image`);
              coverImage = null;
            }
          } catch (error) {
            console.error(`[posts] Error processing cover image data URL:`, error);
            throw error;
          }
        }
        // Если это внешний HTTP/HTTPS URL, загружаем на сервер
        else if (coverImageStr.startsWith("http://") || coverImageStr.startsWith("https://")) {
          try {
            console.log(`[posts] Downloading cover image from: ${coverImageStr}`);
            const imageResponse = await fetch(coverImageStr);
            if (imageResponse.ok) {
              const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
              const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
              
              // Конвертируем HEIC если нужно
              let finalBuffer = imageBuffer;
              if (contentType.includes("heic") || contentType.includes("heif") || 
                  coverImageStr.toLowerCase().endsWith('.heic') || coverImageStr.toLowerCase().endsWith('.heif')) {
                try {
                  const converted = await convertHeicToJpegServer(imageBuffer, coverImageStr, contentType);
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
                  console.error(`[posts] VDS upload error for cover:`, vdsError);
                  throw new Error(`Не удалось загрузить обложку на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
                }
              } else {
                throw new Error("VDS storage не настроен");
              }
            } else {
              console.error(`[posts] Failed to download cover image: ${imageResponse.status}`);
              throw new Error(`Не удалось загрузить изображение: ${imageResponse.status}`);
            }
          } catch (error) {
            console.error(`[posts] Error processing cover image URL:`, error);
            throw error;
          }
        }
        // Иначе игнорируем (некорректный формат)
        else {
          console.warn(`[posts] Invalid cover image format: ${coverImageStr.substring(0, 50)}`);
          coverImage = null;
        }
      }
      // Если это File объект, загружаем его
      else if (coverImageRaw instanceof File) {
        try {
          const bytes = await coverImageRaw.arrayBuffer();
          let buffer: Buffer = Buffer.from(bytes);
          let mimeType = coverImageRaw.type || "image/jpeg";
          let originalName = coverImageRaw.name || "cover.jpg";

          // Конвертируем HEIC если нужно
          if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
            try {
              const converted = await convertHeicToJpegServer(buffer, originalName, mimeType);
              buffer = converted.buffer as Buffer;
              originalName = converted.fileName;
              mimeType = converted.mimeType;
            } catch (convertError) {
              console.error(`[posts] Error converting cover HEIC:`, convertError);
            }
          }

          const fileExtension = path.extname(originalName) || ".jpg";
          const fileName = `cover-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
          const fileKey = `posts/${fileName}`;

          if (isVDSStorageConfigured()) {
            try {
              coverImage = await uploadFileToVDS(fileKey, buffer, mimeType);
              console.log(`[posts] Cover image uploaded to VDS: ${coverImage}`);
            } catch (vdsError) {
              console.error(`[posts] VDS upload error for cover:`, vdsError);
              throw new Error(`Не удалось загрузить обложку на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
            }
          } else {
            throw new Error("VDS storage не настроен");
          }
        } catch (error) {
          console.error(`[posts] Error processing cover image file:`, error);
          throw error;
        }
      }
    } else {
      // Если coverImageRaw не передан, сохраняем существующий cover image
      coverImage = (existingPost as any).coverImage || null;
    }

    // Обрабатываем удаление вложений
    if (deletedAttachmentIdsRaw) {
      try {
        const deletedAttachmentIds = JSON.parse(deletedAttachmentIdsRaw as string) as string[];
        console.log("[posts] Deleting attachments:", deletedAttachmentIds);
        
        if (deletedAttachmentIds.length > 0) {
          // Удаляем вложения из базы данных
          await prisma.postAttachment.deleteMany({
            where: {
              id: { in: deletedAttachmentIds },
              postId: postId, // Убеждаемся, что вложения принадлежат этому посту
            },
          });
          console.log("[posts] Attachments deleted successfully");
        }
      } catch (e) {
        console.error("[posts] Error deleting attachments:", e);
      }
    }

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: "Содержимое поста не может быть пустым" },
        { status: 400 }
      );
    }

    // Очищаем контент от артефактов (сломанные пути, текст "generated-*.jpg" и т.д.)
    // НО НЕ ТРОГАЕМ нормальные изображения с валидными src
    if (postType === "article" && content) {
      // Удаляем только img теги с путями типа "generated-*.jpg" БЕЗ полного URL
      content = content.replace(/<img[^>]*src=["']generated-[^"']+["'][^>]*\/?>/gi, '');
      
      // Удаляем текст "generated-*.jpg" который остался НЕ в src атрибуте
      // (т.е. просто текст в параграфах или между тегами)
      content = content.replace(/>(\s*)generated-\d+[^<]*\.(jpg|jpeg|png|gif|webp|heic|heif)(\s*)</gi, '>$1$3<');
      
      // Удаляем параграфы, которые содержат только имя файла
      content = content.replace(/<p[^>]*>\s*generated-\d+[^<]*\.(jpg|jpeg|png|gif|webp|heic|heif)\s*<\/p>/gi, '');
      
      // Удаляем пустые параграфы
      content = content.replace(/<p[^>]*>\s*<\/p>/gi, '');
      
      // Удаляем пустые div'ы
      content = content.replace(/<div[^>]*>\s*<\/div>/gi, '');
      
      // Удаляем кнопки удаления изображений (image-delete-btn)
      content = content.replace(/<button[^>]*class=["'][^"']*image-delete-btn[^"']*["'][^>]*>.*?<\/button>/gi, '');
      
      // Разворачиваем image-wrapper, оставляя только img
      content = content.replace(/<div[^>]*class=["'][^"']*image-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, (match, inner) => {
        const imgMatch = inner.match(/<img[^>]+>/i);
        return imgMatch ? imgMatch[0] : '';
      });
    }

    // Если это статья, извлекаем и загружаем изображения из HTML
    if (postType === "article" && content) {
      try {
        // Извлекаем все img теги из HTML
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        const imageMap = new Map<string, string>(); // Старый URL -> Новый путь
        let match;
        
        while ((match = imgRegex.exec(content)) !== null) {
          const imageUrl = match[1];
          // Пропускаем уже локальные пути через API и data: URLs
          if (imageUrl.startsWith("/api/uploads/") || imageUrl.startsWith("data:")) {
            continue;
          }
          
          // Если это внешний URL или локальный путь без /api/, загружаем на сервер
          if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://") || 
              (imageUrl.startsWith("/uploads/") && !imageUrl.startsWith("/api/"))) {
            
            // Проверяем, не обработали ли мы уже это изображение
            if (imageMap.has(imageUrl)) {
              continue;
            }
            
            try {
              let imageBuffer: Buffer;
              let contentType = "image/jpeg";
              
              if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
                // Загружаем с внешнего URL
                console.log(`[posts] Downloading image from: ${imageUrl}`);
                const imageResponse = await fetch(imageUrl);
                if (!imageResponse.ok) {
                  console.error(`[posts] Failed to download image: ${imageResponse.status}`);
                  continue;
                }
                imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                contentType = imageResponse.headers.get("content-type") || "image/jpeg";
              } else {
                // Читаем локальный файл
                const localPath = path.join(process.cwd(), "public", imageUrl);
                try {
                  imageBuffer = await readFile(localPath);
                  contentType = "image/jpeg"; // Определим по расширению
                } catch (readError) {
                  console.error(`[posts] Failed to read local file ${localPath}:`, readError);
                  continue;
                }
              }
              
              // Конвертируем HEIC/HEIF если нужно
              if (contentType.includes("heic") || contentType.includes("heif") || 
                  imageUrl.toLowerCase().endsWith('.heic') || imageUrl.toLowerCase().endsWith('.heif')) {
                try {
                  const converted = await convertHeicToJpegServer(imageBuffer, imageUrl, contentType);
                  imageBuffer = converted.buffer as Buffer;
                  contentType = converted.mimeType;
                } catch (convertError) {
                  console.error(`[posts] Error converting HEIC:`, convertError);
                  // Продолжаем с оригиналом
                }
              }
              
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

              // Сохраняем маппинг для замены
              const apiPath = `/api/uploads/posts/${fileName}`;
              imageMap.set(imageUrl, apiPath);
              console.log(`[posts] Mapped image URL: ${imageUrl} -> ${apiPath}`);
            } catch (error) {
              console.error(`[posts] Error processing image ${imageUrl}:`, error);
              // Продолжаем обработку других изображений
            }
          }
        }
        
        // Заменяем все URL в HTML
        imageMap.forEach((newPath, oldUrl) => {
          // Экранируем специальные символы для regex
          const escapedUrl = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(escapedUrl, 'g'), newPath);
        });
        
        console.log(`[posts] Processed ${imageMap.size} images from HTML`);
      } catch (error) {
        console.error("[posts] Error extracting images from HTML:", error);
        // Продолжаем сохранение поста даже если не удалось обработать изображения
      }
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
    const updateData: any = {
      content: content.trim(),
      postType,
      linkMetadata: parsedLinkMetadata,
      videoMetadata: parsedVideoMetadata,
      ...(coverImage !== null && coverImage !== undefined ? { coverImage } : {}),
    };
    
    const post = await prisma.userPost.update({
      where: { id: postId },
      data: updateData,
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

    // Обрабатываем новые вложения (только для НЕ-статей, т.к. для статей изображения в HTML)
    const files = formData.getAll("attachments") as File[];

    if (files.length > 0 && postType !== "article") {
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
            console.error(`[posts/PATCH] Error converting HEIC for ${originalName}:`, error);
            // Продолжаем с оригинальным файлом при ошибке конвертации
          }
        }

        const fileExtension = path.extname(originalName);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
        const localFilePath = path.join(UPLOAD_DIR, fileName);
        
        let finalFilePath = `/uploads/posts/${fileName}`;

        // Пытаемся загрузить на VDS, если он настроен, иначе сохраняем локально
        if (isVDSStorageConfigured()) {
          try {
            const fileKey = `posts/${fileName}`;
            const vdsUrl = await uploadFileToVDS(fileKey, buffer, mimeType);
            if (vdsUrl) {
              finalFilePath = vdsUrl;
              console.log(`[posts/PATCH] File uploaded to VDS: ${vdsUrl}`);
            } else {
              throw new Error("VDS upload returned no URL");
            }
          } catch (vdsError) {
            console.error(`[posts/PATCH] VDS upload error:`, vdsError);
            throw new Error(`Не удалось загрузить файл на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
          }
        } else {
          throw new Error("VDS storage не настроен. Настройте переменные окружения VDS_STORAGE_HOST, VDS_STORAGE_PASSWORD или VDS_STORAGE_PRIVATE_KEY_PATH");
        }

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
            originalName: originalName,
            filePath: finalFilePath,
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
        coverImage: (post as any).coverImage || null,
        isLiked: post.likes.length > 0,
        likesCount: post._count.likes,
        commentsCount: post._count.comments,
        viewCount: (post as any).viewCount || 0,
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

