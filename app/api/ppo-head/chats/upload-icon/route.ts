import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { optimizeWithPreset } from "@/lib/image-optimizer";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь - председатель
    const isPPOHead = session.user.viewMode === "PPO_HEAD" || 
      (session.user.role === "PPO_HEAD" && !(session.user as any).isPPOHead);
    
    if (!isPPOHead && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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
      const url = await uploadFileToVDS(optimized, finalFilename, "chat");
      console.log("[upload-icon] Uploaded to VDS:", url);
      
      return NextResponse.json({ 
        url: `/api/uploads/chat/${finalFilename}`,
        success: true 
      });
    }

    return NextResponse.json(
      { error: "Хранилище не настроено" },
      { status: 500 }
    );
  } catch (error) {
    console.error("[upload-icon] Error:", error);
    return NextResponse.json(
      { error: "Ошибка загрузки файла" },
      { status: 500 }
    );
  }
}

