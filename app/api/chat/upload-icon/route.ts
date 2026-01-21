import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { optimizeWithPreset } from "@/lib/image-optimizer";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";
import crypto from "crypto";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  const { initVDSStorageFromEnv } = require("@/lib/vds-storage");
  initVDSStorageFromEnv();
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    // Проверяем размер (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимум 5MB" },
        { status: 400 }
      );
    }

    const initialBuffer = Buffer.from(await file.arrayBuffer());
    let filename = file.name.toLowerCase();

    // Конвертируем HEIC если нужно
    let imageBuffer: Buffer;
    if (filename.endsWith(".heic") || filename.endsWith(".heif")) {
      const converted = await convertHeicToJpegServer(initialBuffer, filename, file.type);
      imageBuffer = converted.buffer;
      filename = converted.fileName;
    } else {
      imageBuffer = initialBuffer;
    }

    // Оптимизируем как аватар (квадрат 256px)
    const optimized = await optimizeWithPreset(imageBuffer, "avatar");

    // Генерируем уникальное имя
    const hash = crypto.randomBytes(8).toString("hex");
    const finalFilename = `group-icon-${hash}.webp`;

    // Загружаем на VDS
    if (isVDSStorageConfigured()) {
      const fileKey = `chat/${finalFilename}`;
      const url = await uploadFileToVDS(fileKey, optimized.buffer, "image/webp");
      console.log("[chat/upload-icon] Uploaded to VDS:", url);
      
      return NextResponse.json({ 
        url: url, // Возвращаем полный URL от VDS
        success: true 
      });
    }

    return NextResponse.json(
      { error: "Хранилище не настроено" },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("[chat/upload-icon] Error:", error);
    return NextResponse.json(
      { 
        error: error?.message || "Ошибка загрузки файла",
        details: process.env.NODE_ENV === "development" ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}
