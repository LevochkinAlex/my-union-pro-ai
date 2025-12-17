import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { optimizeWithPreset } from "@/lib/image-optimizer";
import { uploadFileToVDS, isVDSStorageConfigured, getFileFromVDS } from "@/lib/vds-storage";
import { getFileUrlWithCDN } from "@/lib/cdn";

/**
 * Оптимизация всех аватаров пользователей
 * POST /api/admin/optimize-avatars
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
    const batchSize = body.batchSize || 10; // Обрабатываем по 10 за раз
    const offset = body.offset || 0;

    // Получаем пользователей с аватарами
    const users = await prisma.user.findMany({
      where: {
        avatarUrl: {
          not: null,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
      skip: offset,
      take: batchSize,
    });

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Все аватары обработаны",
        processed: 0,
        total: 0,
        offset,
      });
    }

    const results = {
      processed: 0,
      optimized: 0,
      skipped: 0,
      errors: 0,
      totalSizeBefore: 0,
      totalSizeAfter: 0,
      errorsList: [] as string[],
    };

    for (const user of users) {
      try {
        if (!user.avatarUrl) {
          results.skipped++;
          continue;
        }

        // Пропускаем уже оптимизированные (WebP)
        if (user.avatarUrl.includes('.webp') || user.avatarUrl.includes('optimized')) {
          results.skipped++;
          continue;
        }

        // Пропускаем data URLs (они уже в памяти)
        if (user.avatarUrl.startsWith('data:')) {
          results.skipped++;
          continue;
        }

        console.log(`[optimize-avatars] Processing user ${user.id} (${user.firstName} ${user.lastName})`);

        // Скачиваем изображение
        let imageBuffer: Buffer;
        let originalSize: number;

        try {
          // Если это URL на VDS или CDN, скачиваем через HTTP
          if (user.avatarUrl.startsWith('http://') || user.avatarUrl.startsWith('https://')) {
            const response = await fetch(user.avatarUrl, {
              headers: {
                'User-Agent': 'MyUnion-Pro-Avatar-Optimizer/1.0',
              },
            });

            if (!response.ok) {
              throw new Error(`Failed to download: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
            originalSize = imageBuffer.length;
          } else {
            // Локальный файл или путь на VDS
            const filePath = user.avatarUrl.replace(/^\/uploads\//, '');
            imageBuffer = await getFileFromVDS(filePath);
            originalSize = imageBuffer.length;
          }
        } catch (downloadError: any) {
          console.error(`[optimize-avatars] Failed to download avatar for user ${user.id}:`, downloadError.message);
          results.errors++;
          results.errorsList.push(`User ${user.id}: Download failed - ${downloadError.message}`);
          continue;
        }

        if (!imageBuffer || imageBuffer.length === 0) {
          results.errors++;
          results.errorsList.push(`User ${user.id}: Empty image buffer`);
          continue;
        }

        results.totalSizeBefore += originalSize;

        // Оптимизируем изображение
        let optimizedBuffer: Buffer;
        let mimeType: string;
        let filename: string;

        try {
          const optimized = await optimizeWithPreset(imageBuffer, "avatar");
          optimizedBuffer = optimized.buffer;
          mimeType = `image/${optimized.format}`;
          filename = `avatars/${user.id}_${Date.now()}.${optimized.format}`;

          results.totalSizeAfter += optimized.size;
          console.log(`[optimize-avatars] Optimized: ${originalSize} -> ${optimized.size} bytes (${optimized.savings.toFixed(1)}% saved)`);
        } catch (optimizeError: any) {
          console.error(`[optimize-avatars] Optimization failed for user ${user.id}:`, optimizeError.message);
          results.errors++;
          results.errorsList.push(`User ${user.id}: Optimization failed - ${optimizeError.message}`);
          continue;
        }

        // Загружаем оптимизированное изображение на VDS
        let newAvatarUrl: string;

        try {
          newAvatarUrl = await uploadFileToVDS(filename, optimizedBuffer, mimeType);
          console.log(`[optimize-avatars] Uploaded optimized avatar: ${newAvatarUrl}`);
        } catch (uploadError: any) {
          console.error(`[optimize-avatars] Upload failed for user ${user.id}:`, uploadError.message);
          results.errors++;
          results.errorsList.push(`User ${user.id}: Upload failed - ${uploadError.message}`);
          continue;
        }

        // Обновляем avatarUrl в БД
        await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: newAvatarUrl },
        });

        results.processed++;
        results.optimized++;

        console.log(`[optimize-avatars] ✅ Successfully optimized avatar for user ${user.id}`);
      } catch (error: any) {
        console.error(`[optimize-avatars] Error processing user ${user.id}:`, error);
        results.errors++;
        results.errorsList.push(`User ${user.id}: ${error.message}`);
      }
    }

    const savings = results.totalSizeBefore > 0
      ? ((results.totalSizeBefore - results.totalSizeAfter) / results.totalSizeBefore * 100).toFixed(1)
      : 0;

    return NextResponse.json({
      success: true,
      message: `Обработано ${results.processed} пользователей`,
      results: {
        ...results,
        savings: `${savings}%`,
        totalSizeBeforeMB: (results.totalSizeBefore / 1024 / 1024).toFixed(2),
        totalSizeAfterMB: (results.totalSizeAfter / 1024 / 1024).toFixed(2),
      },
      offset: offset + users.length,
      hasMore: users.length === batchSize,
    });
  } catch (error: any) {
    console.error("[optimize-avatars] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка при оптимизации аватаров" },
      { status: 500 }
    );
  }
}

/**
 * Получить статистику по аватарам
 * GET /api/admin/optimize-avatars
 */
export async function GET() {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) {
      return error;
    }

    const totalUsers = await prisma.user.count({
      where: {
        avatarUrl: {
          not: null,
        },
      },
    });

    const optimizedUsers = await prisma.user.count({
      where: {
        avatarUrl: {
          contains: '.webp',
        },
      },
    });

    const dataUrlUsers = await prisma.user.count({
      where: {
        avatarUrl: {
          startsWith: 'data:',
        },
      },
    });

    return NextResponse.json({
      total: totalUsers,
      optimized: optimizedUsers,
      dataUrls: dataUrlUsers,
      needsOptimization: totalUsers - optimizedUsers - dataUrlUsers,
    });
  } catch (error: any) {
    console.error("[optimize-avatars] GET Error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении статистики" },
      { status: 500 }
    );
  }
}

