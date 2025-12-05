import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";

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

    // Конвертируем HEIC/HEIF в JPEG, если это изображение
    if (mimeType.startsWith("image/")) {
      try {
        const converted = await convertHeicToJpegServer(buffer, originalName);
        buffer = converted.buffer as Buffer;
        originalName = converted.fileName;
        mimeType = converted.mimeType;
      } catch (error) {
        console.error(`[admin/news/upload-image] Error converting HEIC for ${originalName}:`, error);
        // Продолжаем с оригинальным файлом при ошибке конвертации
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

    // Конвертируем изображение в base64
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    console.log("[upload-image] Successfully converted to base64, length:", dataUrl.length);

    return NextResponse.json({
      success: true,
      url: dataUrl,
      fileName: originalName,
    });
  } catch (error) {
    console.error("[upload-image] Error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

