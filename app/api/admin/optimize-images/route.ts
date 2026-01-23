import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { optimizeWithPreset } from "@/lib/image-optimizer";
import { uploadFileToVDS, isVDSStorageConfigured, getFileFromVDS } from "@/lib/vds-storage";

/**
 * Универсальная оптимизация всех изображений
 * POST /api/admin/optimize-images
 */
export async function POST(request: NextRequest) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    if (!isVDSStorageConfigured()) {
      return NextResponse.json(
        { error: "VDS storage не настроен" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const type = body.type || "all"; // "all", "posts", "chat", "news", "avatars"
    const batchSize = body.batchSize || 10;
    const offset = body.offset || 0;

    const results = {
      processed: 0,
      optimized: 0,
      skipped: 0,
      errors: 0,
      totalSizeBefore: 0,
      totalSizeAfter: 0,
      errorsList: [] as string[],
    };

    let itemsToProcess: any[] = [];

    // Собираем элементы для обработки в зависимости от типа
    if (type === "all" || type === "posts") {
      const postAttachments = await prisma.postAttachment.findMany({
        where: {
          type: "image",
          filePath: {
            not: "",
          },
        },
        select: {
          id: true,
          filePath: true,
          fileName: true,
          postId: true,
        },
        skip: type === "posts" ? offset : 0,
        take: type === "posts" ? batchSize : 1000,
      });
      itemsToProcess.push(...postAttachments.map(a => ({ ...a, _type: "post" as const })));
    }

    // Оптимизация вложений чатов
    if (type === "all" || type === "chat") {
      const chatAttachments = await prisma.chatMessageAttachment.findMany({
        where: {
          url: { not: "" },
        },
        select: {
          id: true,
          url: true,
          type: true,
        },
        take: type === "chat" ? batchSize : 1000,
      });
      itemsToProcess.push(...chatAttachments.map(a => ({ ...a, _type: "chat" as const })));
    }

    if (type === "all" || type === "news") {
      const newsPosts = await prisma.newsPost.findMany({
        where: {
          coverImage: {
            not: "",
          },
        },
        select: {
          id: true,
          coverImage: true,
        },
        skip: type === "news" ? offset : 0,
        take: type === "news" ? batchSize : 1000,
      });
      itemsToProcess.push(...newsPosts.map(n => ({ ...n, _type: "news" as const })));
    }

    // Если "all", ограничиваем общее количество
    if (type === "all") {
      itemsToProcess = itemsToProcess.slice(offset, offset + batchSize);
    }

    // Обрабатываем все собранные элементы
    for (const item of itemsToProcess) {

      try {
        const filePath = item._type === "news" ? item.coverImage : item.filePath;
        
        if (!filePath) {
          results.skipped++;
          continue;
        }

        // Пропускаем уже оптимизированные
        if (filePath.includes('.webp') || filePath.startsWith('data:')) {
          results.skipped++;
          continue;
        }

        console.log(`[optimize-images] Processing ${item._type} ${item.id}`);

        // Скачиваем изображение
        let imageBuffer: Buffer;
        let originalSize: number;

        try {
          if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
            originalSize = imageBuffer.length;
          } else {
            const vdsPath = filePath.replace(/^\/uploads\//, '');
            imageBuffer = await getFileFromVDS(vdsPath);
            originalSize = imageBuffer.length;
          }
        } catch (downloadError: any) {
          console.error(`[optimize-images] Failed to download ${item._type} ${item.id}:`, downloadError.message);
          results.errors++;
          results.errorsList.push(`${item._type} ${item.id}: Download failed`);
          continue;
        }

        results.totalSizeBefore += originalSize;

        // Оптимизируем в зависимости от типа
        const preset = item._type === "news" ? "cover" : "post";
        const optimized = await optimizeWithPreset(imageBuffer, preset);
        
        // Генерируем новый путь
        let fileKey: string;
        if (item._type === "post") {
          fileKey = `posts/${item.postId}_${Date.now()}.${optimized.format}`;
        } else if (item._type === "chat") {
          fileKey = `chat/${item.messageId}_${Date.now()}.${optimized.format}`;
        } else {
          fileKey = `news/${item.id}_${Date.now()}.${optimized.format}`;
        }

        const newFilePath = await uploadFileToVDS(fileKey, optimized.buffer, `image/${optimized.format}`);

        // Обновляем в БД
        if (item._type === "post") {
          await prisma.postAttachment.update({
            where: { id: item.id },
            data: { filePath: newFilePath },
          });
        // ChatMessageAttachment удалена
        // } else if (item._type === "chat") {
        //   await prisma.chatMessageAttachment.update({...});
        } else {
          await prisma.newsPost.update({
            where: { id: item.id },
            data: { coverImage: newFilePath },
          });
        }

        results.totalSizeAfter += optimized.size;
        results.processed++;
        results.optimized++;
      } catch (error: any) {
        console.error(`[optimize-images] Error processing ${item._type} ${item.id}:`, error);
        results.errors++;
        results.errorsList.push(`${item._type} ${item.id}: ${error.message}`);
      }
    }

    const savings = results.totalSizeBefore > 0
      ? ((results.totalSizeBefore - results.totalSizeAfter) / results.totalSizeBefore * 100).toFixed(1)
      : 0;

    return NextResponse.json({
      success: true,
      message: `Обработано ${results.processed} изображений`,
      results: {
        ...results,
        savings: `${savings}%`,
        totalSizeBeforeMB: (results.totalSizeBefore / 1024 / 1024).toFixed(2),
        totalSizeAfterMB: (results.totalSizeAfter / 1024 / 1024).toFixed(2),
      },
      offset: offset + results.processed,
      hasMore: results.processed === batchSize,
    });
  } catch (error: any) {
    console.error("[optimize-images] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка при оптимизации изображений" },
      { status: 500 }
    );
  }
}

/**
 * Получить статистику по изображениям
 * GET /api/admin/optimize-images
 */
export async function GET() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const [postImages, chatImages, newsImages, userAvatars] = await Promise.all([
      prisma.postAttachment.count({
        where: {
          type: "image",
          filePath: { not: "" },
        },
      }),
      prisma.chatMessageAttachment.count({
        where: { url: { not: "" } },
      }),
      prisma.newsPost.count({
        where: {
          coverImage: { not: "" },
        },
      }),
      prisma.user.count({
        where: {
          avatarUrl: { not: "" },
        },
      }),
    ]);

    const [optimizedPosts, optimizedChat, optimizedNews, optimizedAvatars] = await Promise.all([
      prisma.postAttachment.count({
        where: {
          type: "image",
          filePath: { contains: '.webp' },
        },
      }),
      Promise.resolve(0), // ChatMessageAttachment удалена
      prisma.newsPost.count({
        where: {
          coverImage: { contains: '.webp' },
        },
      }),
      prisma.user.count({
        where: {
          avatarUrl: { contains: '.webp' },
        },
      }),
    ]);

    return NextResponse.json({
      posts: {
        total: postImages,
        optimized: optimizedPosts,
        needsOptimization: postImages - optimizedPosts,
      },
      chat: {
        total: chatImages,
        optimized: optimizedChat,
        needsOptimization: chatImages - optimizedChat,
      },
      news: {
        total: newsImages,
        optimized: optimizedNews,
        needsOptimization: newsImages - optimizedNews,
      },
      avatars: {
        total: userAvatars,
        optimized: optimizedAvatars,
        needsOptimization: userAvatars - optimizedAvatars,
      },
      total: {
        total: postImages + chatImages + newsImages + userAvatars,
        optimized: optimizedPosts + optimizedChat + optimizedNews + optimizedAvatars,
        needsOptimization: (postImages + chatImages + newsImages + userAvatars) - (optimizedPosts + optimizedChat + optimizedNews + optimizedAvatars),
      },
    });
  } catch (error: any) {
    console.error("[optimize-images] GET Error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении статистики" },
      { status: 500 }
    );
  }
}

