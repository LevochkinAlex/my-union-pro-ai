import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";
import { optimizeWithPreset, getMimeType, isImageFile } from "@/lib/image-optimizer";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "posts");

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

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
        console.error(`[posts/upload-image] Error converting HEIC for ${originalName}:`, error);
        // Продолжаем с оригинальным файлом при ошибке конвертации
      }
    }

    // ✨ Оптимизируем изображение (сжатие + конвертация в WebP)
    let optimizedBuffer = buffer;
    let optimizedMime = mimeType;
    let fileExtension = path.extname(originalName);
    
    if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
      try {
        const originalSize = buffer.length;
        const optimized = await optimizeWithPreset(buffer, "post");
        optimizedBuffer = optimized.buffer;
        optimizedMime = getMimeType(optimized.format);
        fileExtension = `.${optimized.format}`;
        
        console.log(`[posts/upload-image] Image optimized: ${(originalSize / 1024).toFixed(1)}KB -> ${(optimized.size / 1024).toFixed(1)}KB (${optimized.savings}% saved)`);
      } catch (optError) {
        console.error(`[posts/upload-image] Optimization failed, using original:`, optError);
      }
    }

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
    const localFilePath = path.join(UPLOAD_DIR, fileName);

    let finalFilePath: string;
    let returnUrl: string;

    // Всегда создаём директорию
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Всегда загружаем на VDS - локальное хранилище отключено
    if (!isVDSStorageConfigured()) {
      throw new Error("VDS storage не настроен. Настройте переменные окружения VDS_STORAGE_HOST, VDS_STORAGE_PASSWORD или VDS_STORAGE_PRIVATE_KEY_PATH");
    }

    try {
      const fileKey = `posts/${fileName}`;
      const vdsUrl = await uploadFileToVDS(fileKey, optimizedBuffer, optimizedMime);
      if (vdsUrl) {
        finalFilePath = vdsUrl;
        returnUrl = vdsUrl; // Используем VDS URL напрямую
        console.log(`[posts/upload-image] File uploaded to VDS: ${vdsUrl}`);
      } else {
        throw new Error("VDS upload returned no URL");
      }
    } catch (vdsError) {
      console.error(`[posts/upload-image] VDS upload error:`, vdsError);
      throw new Error(`Не удалось загрузить файл на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
    }

    return NextResponse.json({
      success: true,
      url: returnUrl,
      fileName: originalName,
    });
  } catch (error: any) {
    console.error("[posts/upload-image] Error:", error);
    return NextResponse.json(
      { error: error.message || "Не удалось загрузить изображение" },
      { status: 500 }
    );
  }
}

