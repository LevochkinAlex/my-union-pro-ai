import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";
import { optimizeWithPreset, getMimeType } from "@/lib/image-optimizer";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

// POST /api/admin/news/upload-image - загрузка изображения для новости
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }

    // Проверяем размер (максимум 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Размер файла не должен превышать 10MB" },
        { status: 400 }
      );
    }

    // Конвертируем изображение
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
        console.error(`[admin/news/upload-image] Error converting HEIC for ${originalName}:`, error);
      }
    }

    // Проверяем тип файла после конвертации
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: "Разрешены только изображения (JPEG, PNG, WebP, HEIC/HEIF)" },
        { status: 400 }
      );
    }

    // ✨ Оптимизируем изображение для обложки (сжатие + конвертация в WebP)
    let optimizedBuffer = buffer;
    let optimizedMime = mimeType;
    let fileExtension = originalName.split('.').pop() || 'jpg';
    
    try {
      const originalSize = buffer.length;
      const optimized = await optimizeWithPreset(buffer, "cover");
      optimizedBuffer = optimized.buffer;
      optimizedMime = getMimeType(optimized.format);
      fileExtension = optimized.format;
      
      console.log(`[admin/news/upload-image] Image optimized: ${(originalSize / 1024).toFixed(1)}KB -> ${(optimized.size / 1024).toFixed(1)}KB (${optimized.savings}% saved)`);
    } catch (optError) {
      console.error(`[admin/news/upload-image] Optimization failed, using original:`, optError);
    }

    // Загружаем на VDS вместо base64
    if (!isVDSStorageConfigured()) {
      // Fallback на base64 если VDS не настроен
      const base64 = optimizedBuffer.toString("base64");
      const dataUrl = `data:${optimizedMime};base64,${base64}`;
      console.log("[admin/news/upload-image] VDS not configured, using base64");
      
      return NextResponse.json({
        success: true,
        url: dataUrl,
        fileName: originalName,
      });
    }

    // Загружаем на VDS
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const fileKey = `news/${fileName}`;
    
    try {
      const vdsPath = await uploadFileToVDS(fileKey, optimizedBuffer, optimizedMime);
      console.log(`[admin/news/upload-image] Image uploaded to VDS: ${vdsPath}`);
      
      // Преобразуем путь в URL для API endpoint
      // vdsPath будет типа /uploads/news/filename.webp
      // Преобразуем в /api/uploads/news/filename.webp
      const apiUrl = vdsPath.replace(/^\/uploads\//, '/api/uploads/');
      
      return NextResponse.json({
        success: true,
        url: apiUrl,
        fileName: originalName,
      });
    } catch (vdsError) {
      console.error("[admin/news/upload-image] VDS upload failed:", vdsError);
      throw new Error("Не удалось загрузить изображение");
    }
  } catch (error) {
    console.error("[admin/news/upload-image] Error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

