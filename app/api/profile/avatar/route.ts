import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { optimizeWithPreset, getMimeType, getOptimizedFilename } from "@/lib/image-optimizer";
import { cacheDeletePattern, getCacheKey } from "@/lib/cache";
import { invalidateUsersCache } from "@/lib/cache-invalidation";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Загрузка аватара пользователя
 * POST /api/profile/avatar
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const avatarFile = formData.get("avatar") as File | null;

    if (!avatarFile) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    // Проверяем тип файла
    if (!avatarFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "Файл должен быть изображением" }, { status: 400 });
    }

    // Проверяем размер файла (максимум 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (avatarFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Размер файла не должен превышать ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Получаем буфер из файла
    const bytes = await avatarFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // ✨ Оптимизируем изображение (сжатие + конвертация в WebP)
    let optimizedBuffer: Buffer;
    let mimeType: string;
    let filename: string;
    
    try {
      const optimized = await optimizeWithPreset(buffer, "avatar");
      optimizedBuffer = optimized.buffer;
      mimeType = getMimeType(optimized.format);
      filename = `${session.user.id}_${Date.now()}.${optimized.format}`;
      
      console.log(`[profile/avatar] Image optimized: ${avatarFile.size} -> ${optimized.size} bytes (${optimized.savings}% saved)`);
    } catch (optimizeError) {
      console.error("[profile/avatar] Optimization failed, using original:", optimizeError);
      // Если оптимизация не удалась, используем оригинал
      optimizedBuffer = buffer;
      mimeType = avatarFile.type;
      const fileExtension = avatarFile.name.split(".").pop() || "jpg";
      filename = `${session.user.id}_${Date.now()}.${fileExtension}`;
    }
    
    let avatarUrl: string;
    
    // Всегда загружаем на VDS, если он настроен
    if (isVDSStorageConfigured()) {
      try {
        const fileKey = `avatars/${filename}`;
        avatarUrl = await uploadFileToVDS(fileKey, optimizedBuffer, mimeType);
        console.log(`[profile/avatar] Avatar uploaded to VDS: ${avatarUrl}`);
      } catch (vdsError) {
        console.error("[profile/avatar] VDS upload failed:", vdsError);
        throw new Error(`Не удалось загрузить аватар на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
      }
    } else {
      throw new Error("VDS storage не настроен. Настройте переменные окружения VDS_STORAGE_HOST, VDS_STORAGE_PASSWORD или VDS_STORAGE_PRIVATE_KEY_PATH");
    }
    
    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl },
    });

    // Инвалидируем кеш профиля и пользователей, чтобы обновить аватар везде
    try {
      await Promise.all([
        cacheDeletePattern(`profile:userId:${session.user.id}:*`),
        invalidateUsersCache(), // Инвалидируем кэш списка пользователей
      ]);
    } catch (cacheError) {
      // Не блокируем загрузку аватара, если инвалидация кеша не удалась
      console.warn("[profile/avatar] Cache invalidation failed (non-critical):", cacheError);
    }
    
    console.log("[profile/avatar] Avatar uploaded successfully:", {
      userId: session.user.id,
      filename,
      originalSize: avatarFile.size,
      optimizedSize: optimizedBuffer.length,
      avatarUrl,
    });

    return NextResponse.json({
      success: true,
      avatarUrl,
    });
  } catch (error) {
    console.error("[profile/avatar] Error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить аватар" },
      { status: 500 }
    );
  }
}
